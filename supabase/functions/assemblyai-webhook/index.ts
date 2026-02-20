/**
 * assemblyai-webhook
 * ──────────────────
 * Receives completion callbacks from AssemblyAI after transcription finishes.
 * Fetches the full transcript + sentiment results and stores them in
 * call_transcriptions_assemblyai.
 *
 * AssemblyAI POSTs to:
 *   https://<project>.supabase.co/functions/v1/assemblyai-webhook
 *     ?call_id=<vapi_call_id>
 *     &secret=<ASSEMBLYAI_WEBHOOK_SECRET>
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObj = Record<string, any>;

Deno.serve(async (req: Request) => {
  // AssemblyAI sends POST; respond quickly to prevent retries
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const assemblyaiApiKey = Deno.env.get("ASSEMBLYAI_API_KEY")!;
  const expectedSecret = Deno.env.get("ASSEMBLYAI_WEBHOOK_SECRET") ?? "";

  const url = new URL(req.url);
  const callId = url.searchParams.get("call_id");
  const secretParam = url.searchParams.get("secret") ?? "";

  // ── Validate secret ───────────────────────────────────────────────────────
  if (expectedSecret && secretParam !== expectedSecret) {
    console.warn("[assemblyai-webhook] Invalid secret — ignoring request");
    return new Response("Unauthorized", { status: 401 });
  }

  if (!callId) {
    console.warn("[assemblyai-webhook] Missing call_id query param");
    return new Response("Missing call_id", { status: 400 });
  }

  // ── Parse AssemblyAI webhook body ─────────────────────────────────────────
  let body: PlainObj;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const transcriptId = body.transcript_id as string | undefined;
  const status = body.status as string | undefined;

  console.info(`[assemblyai-webhook] call_id=${callId} transcript_id=${transcriptId} status=${status}`);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // ── Handle terminal statuses ──────────────────────────────────────────────
  if (status === "error") {
    await supabase
      .from("call_transcriptions_assemblyai")
      .update({ status: "error", error_message: "assemblyai_processing_error", updated_at: new Date().toISOString() })
      .eq("call_id", callId);
    console.error(`[assemblyai-webhook] AssemblyAI processing error for ${callId}`);
    return new Response("OK", { status: 200 });
  }

  if (status !== "completed") {
    // Non-terminal status (queued, processing) — nothing to do yet
    return new Response("OK", { status: 200 });
  }

  if (!transcriptId) {
    console.error(`[assemblyai-webhook] completed but no transcript_id for ${callId}`);
    return new Response("Missing transcript_id", { status: 400 });
  }

  // ── Fetch full transcript from AssemblyAI ─────────────────────────────────
  try {
    const aaiResp = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
      headers: { authorization: assemblyaiApiKey },
    });

    if (!aaiResp.ok) {
      throw new Error(`AssemblyAI fetch ${aaiResp.status}`);
    }

    const result: PlainObj = await aaiResp.json();

    const charCount = typeof result.text === "string" ? (result.text as string).length : 0;
    const uttCount = Array.isArray(result.utterances) ? result.utterances.length : 0;
    const sentCount = Array.isArray(result.sentiment_analysis_results) ? result.sentiment_analysis_results.length : 0;

    await supabase
      .from("call_transcriptions_assemblyai")
      .update({
        status: "completed",
        assemblyai_id: transcriptId,
        transcript_text: result.text ?? null,
        utterances: result.utterances ?? null,
        sentiment_results: result.sentiment_analysis_results ?? null,
        words: result.words ?? null,
        audio_duration_ms: result.audio_duration ?? null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("call_id", callId);

    console.info(
      `[assemblyai-webhook] Stored ${callId}: ${charCount} chars, ${uttCount} utterances, ${sentCount} sentiment results`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[assemblyai-webhook] Failed to store result for ${callId}:`, msg);
    await supabase
      .from("call_transcriptions_assemblyai")
      .update({ status: "error", error_message: msg, updated_at: new Date().toISOString() })
      .eq("call_id", callId);
  }

  return new Response("OK", { status: 200 });
});
