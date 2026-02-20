import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FEEDBACK_FIELDS = ["voice_assistant_feedback", "communication_style_feedback", "experiment_feedback"] as const;

type FeedbackField = (typeof FEEDBACK_FIELDS)[number];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const groqApiKey = Deno.env.get("GROQ_API_KEY");
  if (!groqApiKey) {
    console.error("[transcribe-dictation] GROQ_API_KEY secret not set");
    return new Response(JSON.stringify({ error: "GROQ_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let prolificId: string;
  let callId: string;
  try {
    const body = await req.json();
    prolificId = body.prolificId;
    callId = body.callId;
    if (!prolificId || !callId) throw new Error("Missing prolificId or callId");
  } catch (err) {
    console.error("[transcribe-dictation] Bad request body:", err);
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.info("[transcribe-dictation] Starting for", { prolificId, callId });

  const results: Record<string, { status: string; chars?: number; error?: string }> = {};

  for (const field of FEEDBACK_FIELDS) {
    try {
      // 1. Fetch all dictation_recordings rows for this participant + field
      const { data: recordings, error: recErr } = await supabase
        .from("dictation_recordings")
        .select("storage_bucket, storage_path, mime_type, duration_ms")
        .eq("prolific_id", prolificId)
        .eq("field", field)
        .order("created_at", { ascending: true });

      if (recErr) {
        console.error(`[transcribe-dictation] Failed to fetch recordings for ${field}:`, recErr.message);
        results[field] = { status: "error", error: recErr.message };
        continue;
      }

      if (!recordings || recordings.length === 0) {
        console.info(`[transcribe-dictation] No recordings for ${field}, skipping`);
        results[field] = { status: "no_recordings" };
        continue;
      }

      const totalDurationMs = recordings.reduce((sum, r) => sum + (r.duration_ms ?? 0), 0);
      console.info(
        `[transcribe-dictation] ${recordings.length} clip(s) for ${field}, total ${Math.round(totalDurationMs / 1000)}s`,
      );

      // 2. Idempotency check — skip if we already logged a transcript_appended event for this field
      const { data: existingEvent } = await supabase
        .from("navigation_events")
        .select("id")
        .eq("prolific_id", prolificId)
        .eq("event_type", "dictation_transcript_appended")
        .eq("page_name", "feedback")
        .contains("metadata", { field })
        .maybeSingle();

      if (existingEvent) {
        console.info(`[transcribe-dictation] ${field} already transcribed (event found), skipping`);
        results[field] = { status: "skipped_already_transcribed" };
        continue;
      }

      // 3. Fetch existing typed text — if present we will append, not replace
      const { data: existing, error: existErr } = await supabase
        .from("experiment_responses")
        .select(field)
        .eq("prolific_id", prolificId)
        .maybeSingle();

      if (existErr) {
        console.error(`[transcribe-dictation] Failed to fetch existing response for ${field}:`, existErr.message);
        results[field] = { status: "error", error: existErr.message };
        continue;
      }

      const existingText = (existing as Record<string, unknown> | null)?.[field];
      const hasExistingText =
        existingText &&
        typeof existingText === "string" &&
        existingText.trim() &&
        existingText.trim() !== "Not provided";

      // 3. Download and transcribe each clip, accumulate transcript
      const transcriptParts: string[] = [];

      for (const rec of recordings) {
        const { data: fileData, error: dlErr } = await supabase.storage
          .from(rec.storage_bucket)
          .download(rec.storage_path);

        if (dlErr || !fileData) {
          console.error(`[transcribe-dictation] Failed to download ${rec.storage_path}:`, dlErr?.message);
          continue;
        }

        // 4. Send to Groq Whisper
        const audioBlob = fileData;
        const ext = rec.mime_type?.includes("mp4") ? "m4a" : rec.mime_type?.includes("ogg") ? "ogg" : "webm";
        const formData = new FormData();
        formData.append("file", new File([audioBlob], `audio.${ext}`, { type: rec.mime_type ?? "audio/webm" }));
        formData.append("model", "whisper-large-v3-turbo");
        formData.append("response_format", "text");

        const groqResp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqApiKey}` },
          body: formData,
        });

        if (!groqResp.ok) {
          const errText = await groqResp.text().catch(() => "");
          console.error(`[transcribe-dictation] Groq API error for ${field} clip:`, groqResp.status, errText);
          continue;
        }

        const transcript = (await groqResp.text()).trim();
        if (transcript) {
          transcriptParts.push(transcript);
        }
      }

      if (transcriptParts.length === 0) {
        console.info(`[transcribe-dictation] No transcript produced for ${field}`);
        results[field] = { status: "no_transcript" };
        continue;
      }

      const fullTranscript = transcriptParts.join(" ").trim();

      // 5. Write transcript — append to typed text if present, otherwise replace
      const newFieldValue = hasExistingText ? `${(existingText as string).trim()} ${fullTranscript}` : fullTranscript;

      const { error: updateErr } = await supabase
        .from("experiment_responses")
        .update({ [field]: newFieldValue })
        .eq("prolific_id", prolificId);

      if (updateErr) {
        console.error(`[transcribe-dictation] Failed to update ${field}:`, updateErr.message);
        results[field] = { status: "error", error: updateErr.message };
        continue;
      }

      // 6. Log dictation_transcript_appended so the Researcher UI can highlight dictated text in blue
      await supabase.from("navigation_events").insert({
        prolific_id: prolificId,
        call_id: callId,
        page_name: "feedback",
        event_type: "dictation_transcript_appended",
        metadata: { context: "dictation", field, text: fullTranscript },
      });

      console.info(
        `[transcribe-dictation] ${field} transcribed: ${fullTranscript.length} chars (appended: ${!!hasExistingText})`,
      );
      results[field] = { status: "transcribed", chars: fullTranscript.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[transcribe-dictation] Unexpected error for ${field}:`, msg);
      results[field] = { status: "error", error: msg };
    }
  }

  console.info("[transcribe-dictation] Done", { prolificId, results });

  return new Response(JSON.stringify({ success: true, prolificId, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
