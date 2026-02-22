/**
 * trigger-assemblyai-transcription
 * ─────────────────────────────────
 * Submits pending Vapi call recordings to AssemblyAI for high-quality
 * re-transcription with sentiment analysis and speaker diarization.
 *
 * Requires in Lovable secrets:
 *   VAPI_PRIVATE_KEY          — already set
 *   ASSEMBLYAI_API_KEY        — add in Lovable → Supabase → Secrets
 *   ASSEMBLYAI_WEBHOOK_SECRET — add in Lovable → Supabase → Secrets (any random string)
 *
 * Called from Researcher UI. Returns immediately after submitting;
 * results arrive via the assemblyai-webhook Edge Function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObj = Record<string, any>;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const vapiPrivateKey = Deno.env.get("VAPI_PRIVATE_KEY");
  const assemblyaiApiKey = Deno.env.get("ASSEMBLYAI_API_KEY");
  const webhookSecret = Deno.env.get("ASSEMBLYAI_WEBHOOK_SECRET") ?? "";

  if (!vapiPrivateKey || !assemblyaiApiKey) {
    return new Response(
      JSON.stringify({ error: "Missing secrets: VAPI_PRIVATE_KEY or ASSEMBLYAI_API_KEY not set in Lovable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Auth: require logged-in researcher (same pattern as worker-vapi-evaluations) ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !data?.user) {
    return new Response(JSON.stringify({ error: "Invalid user session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: roleData } = await supabaseAdmin
    .from("researcher_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!roleData) {
    return new Response(JSON.stringify({ error: "Forbidden: researcher role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Parse request body ────────────────────────────────────────────────────
  const body: PlainObj = await req.json().catch(() => ({}));
  const limit: number = typeof body.limit === "number" ? Math.min(body.limit, 25) : 10;
  const retryErrors: boolean = body.retry === true;

  // ── Find pending call_ids (participants only — skip researcher test calls) ──
  const { data: responses } = await supabaseAdmin
    .from("experiment_responses")
    .select("call_id, prolific_id")
    .not("call_id", "is", null);

  // Participants have exactly 24-char Prolific IDs; researcher calls start with "researcher-"
  const allCallIds: string[] = [
    ...new Set(
      (responses ?? [])
        .filter((r: PlainObj) => typeof r.prolific_id === "string" && r.prolific_id.length === 24)
        .map((r: PlainObj) => r.call_id as string)
        .filter((id: string) => typeof id === "string" && id.length > 10), // exclude null/empty/junk call_ids
    ),
  ];

  const { data: existing } = await supabaseAdmin.from("call_transcriptions_assemblyai").select("call_id, status");

  const existingMap = new Map<string, string>(
    (existing ?? []).map((e: PlainObj) => [e.call_id as string, e.status as string]),
  );

  const toProcess = allCallIds
    .filter((id) => {
      const status = existingMap.get(id);
      if (!status) return true;
      if (status === "error" && retryErrors) return true;
      return false;
    })
    .slice(0, limit);

  console.info(`[trigger-assemblyai] Found ${toProcess.length} calls to submit (total=${allCallIds.length})`);

  if (toProcess.length === 0) {
    return new Response(JSON.stringify({ submitted: 0, message: "No pending calls to process" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Submit each call to AssemblyAI ────────────────────────────────────────
  const webhookBase = `${supabaseUrl}/functions/v1/assemblyai-webhook`;
  const results: PlainObj[] = [];

  for (const callId of toProcess) {
    try {
      // 1. Get recording URL from Vapi
      const vapiResp = await fetch(`https://api.vapi.ai/call/${callId}`, {
        headers: { Authorization: `Bearer ${vapiPrivateKey}` },
      });

      if (!vapiResp.ok) {
        const errText = await vapiResp.text().catch(() => "");
        console.error(`[trigger-assemblyai] Vapi ${vapiResp.status} for ${callId}: ${errText.slice(0, 100)}`);
        await supabaseAdmin.from("call_transcriptions_assemblyai").upsert({
          call_id: callId,
          status: "error",
          error_message: `vapi_${vapiResp.status}`,
          updated_at: new Date().toISOString(),
        });
        results.push({ callId, status: "error", reason: `vapi_${vapiResp.status}` });
        continue;
      }

      const vapiData: PlainObj = await vapiResp.json();
      const recordingUrl = typeof vapiData.recordingUrl === "string" ? vapiData.recordingUrl : null;

      if (!recordingUrl) {
        console.info(`[trigger-assemblyai] No recording for ${callId}`);
        await supabaseAdmin.from("call_transcriptions_assemblyai").upsert({
          call_id: callId,
          status: "no_recording",
          updated_at: new Date().toISOString(),
        });
        results.push({ callId, status: "no_recording" });
        continue;
      }

      // 2. Submit to AssemblyAI — webhook carries call_id + optional secret
      const webhookUrl =
        `${webhookBase}?call_id=${encodeURIComponent(callId)}` +
        (webhookSecret ? `&secret=${encodeURIComponent(webhookSecret)}` : "");

      const aaiResp = await fetch("https://api.assemblyai.com/v2/transcript", {
        method: "POST",
        headers: { authorization: assemblyaiApiKey, "content-type": "application/json" },
        body: JSON.stringify({
          audio_url: recordingUrl,
          speech_models: ["universal-3-pro"],
          sentiment_analysis: true,
          speaker_labels: true,
          webhook_url: webhookUrl,
        }),
      });

      if (!aaiResp.ok) {
        const errText = await aaiResp.text().catch(() => "");
        console.error(`[trigger-assemblyai] AssemblyAI ${aaiResp.status} for ${callId}: ${errText.slice(0, 100)}`);
        await supabaseAdmin.from("call_transcriptions_assemblyai").upsert({
          call_id: callId,
          status: "error",
          error_message: `assemblyai_submit_${aaiResp.status}: ${errText.slice(0, 200)}`,
          updated_at: new Date().toISOString(),
        });
        results.push({ callId, status: "error", reason: `assemblyai_${aaiResp.status}` });
        continue;
      }

      const aaiData: PlainObj = await aaiResp.json();
      const assemblyaiId = aaiData.id as string;

      await supabaseAdmin.from("call_transcriptions_assemblyai").upsert({
        call_id: callId,
        assemblyai_id: assemblyaiId,
        status: "submitted",
        updated_at: new Date().toISOString(),
      });

      console.info(`[trigger-assemblyai] Submitted ${callId} → assemblyai_id=${assemblyaiId}`);
      results.push({ callId, status: "submitted", assemblyaiId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[trigger-assemblyai] Unexpected error for ${callId}:`, msg);
      await supabaseAdmin.from("call_transcriptions_assemblyai").upsert({
        call_id: callId,
        status: "error",
        error_message: msg,
        updated_at: new Date().toISOString(),
      });
      results.push({ callId, status: "error", reason: msg });
    }
  }

  const submittedCount = results.filter((r) => r.status === "submitted").length;
  console.info(`[trigger-assemblyai] Done: ${submittedCount}/${toProcess.length} submitted`);

  return new Response(JSON.stringify({ submitted: submittedCount, total: toProcess.length, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
