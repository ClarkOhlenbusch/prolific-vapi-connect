/**
 * AssemblyAI Re-Transcription Pipeline
 * ======================================
 * Fetches Vapi call recordings and submits them to AssemblyAI for high-quality
 * transcription with per-sentence sentiment analysis and speaker diarization.
 *
 * SETUP — run this SQL in Lovable's SQL editor FIRST:
 * ─────────────────────────────────────────────────────
 *   CREATE TABLE IF NOT EXISTS call_transcriptions_assemblyai (
 *     call_id              text PRIMARY KEY,
 *     assemblyai_id        text,
 *     status               text NOT NULL DEFAULT 'pending',
 *     transcript_text      text,
 *     utterances           jsonb,
 *     sentiment_results    jsonb,
 *     words                jsonb,
 *     audio_duration_ms    integer,
 *     error_message        text,
 *     created_at           timestamptz NOT NULL DEFAULT now(),
 *     updated_at           timestamptz NOT NULL DEFAULT now()
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_call_transcriptions_status
 *     ON call_transcriptions_assemblyai(status);
 * ─────────────────────────────────────────────────────
 *
 * USAGE:
 *   node --env-file=.env --env-file=.env.local scripts/run-assemblyai-transcription.mjs
 *
 * REQUIRED ENV VARS:
 *   VITE_SUPABASE_URL         — in .env (already there)
 *   VAPI_PRIVATE_KEY          — in .env.local (already there)
 *   SUPABASE_SERVICE_ROLE_KEY — add to .env.local (Supabase Dashboard → Settings → API → service_role)
 *   ASSEMBLYAI_API_KEY        — add to .env.local (AssemblyAI Dashboard → API Keys)
 *
 * OPTIONS:
 *   --dry-run    Print what would be processed without calling any APIs
 *   --retry      Also retry calls with status=error (default: skip them)
 *   --limit N    Process at most N calls this run
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAPI_PRIVATE_KEY = process.env.VAPI_PRIVATE_KEY;
const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY;

const MAX_CONCURRENT = 5; // AssemblyAI free plan limit
const POLL_INTERVAL_MS = 6000; // poll every 6s
const MAX_POLL_ATTEMPTS = 60; // 6 min max per transcript

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RETRY_ERRORS = args.includes("--retry");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i !== -1 ? parseInt(args[i + 1], 10) : Infinity;
})();

// ─── Validation ───────────────────────────────────────────────────────────────

const missing = [
  ["VITE_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_KEY],
  ["VAPI_PRIVATE_KEY", VAPI_PRIVATE_KEY],
  ["ASSEMBLYAI_API_KEY", ASSEMBLYAI_API_KEY],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error("Missing required env vars:", missing.join(", "));
  console.error("Run with: node --env-file=.env scripts/run-assemblyai-transcription.mjs");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getVapiRecordingUrl(callId) {
  const resp = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Vapi API ${resp.status}: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.recordingUrl ?? null;
}

async function submitToAssemblyAI(audioUrl) {
  const resp = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: ["universal-3-pro"],
      sentiment_analysis: true,
      speaker_labels: true,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`AssemblyAI submit ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

async function pollUntilDone(transcriptId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const resp = await fetch(
      `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
      { headers: { authorization: ASSEMBLYAI_API_KEY } }
    );
    const data = await resp.json();
    if (data.status === "completed") return data;
    if (data.status === "error") throw new Error(`AssemblyAI error: ${data.error}`);
    process.stdout.write(`\r  polling ${transcriptId}: ${data.status} (${attempt + 1}/${MAX_POLL_ATTEMPTS})`);
  }
  throw new Error(`Timed out polling ${transcriptId}`);
}

async function upsertStatus(callId, fields) {
  const { error } = await supabase
    .from("call_transcriptions_assemblyai")
    .upsert({ call_id: callId, updated_at: new Date().toISOString(), ...fields });
  if (error) console.error(`  DB upsert error for ${callId}:`, error.message);
}

// ─── Per-call processor ───────────────────────────────────────────────────────

async function processCall(callId) {
  console.log(`\n[${callId}] Starting...`);

  try {
    // 1. Get recording URL from Vapi
    let recordingUrl;
    try {
      recordingUrl = await getVapiRecordingUrl(callId);
    } catch (err) {
      console.log(`  Vapi fetch failed: ${err.message}`);
      await upsertStatus(callId, { status: "error", error_message: `vapi: ${err.message}` });
      return;
    }

    if (!recordingUrl) {
      console.log(`  No recording URL — skipping`);
      await upsertStatus(callId, { status: "no_recording" });
      return;
    }

    console.log(`  Recording URL found`);
    await upsertStatus(callId, { status: "processing" });

    // 2. Submit to AssemblyAI
    const submission = await submitToAssemblyAI(recordingUrl);
    console.log(`  Submitted → assemblyai_id=${submission.id}`);
    await upsertStatus(callId, { assemblyai_id: submission.id });

    // 3. Poll until done
    const result = await pollUntilDone(submission.id);
    process.stdout.write("\n");

    // 4. Store results
    await upsertStatus(callId, {
      status: "completed",
      assemblyai_id: submission.id,
      transcript_text: result.text ?? null,
      utterances: result.utterances ?? null,
      sentiment_results: result.sentiment_analysis_results ?? null,
      words: result.words ?? null,
      audio_duration_ms: result.audio_duration ?? null,
      error_message: null,
    });

    const charCount = result.text?.length ?? 0;
    const uttCount = result.utterances?.length ?? 0;
    const sentCount = result.sentiment_analysis_results?.length ?? 0;
    console.log(`  Done: ${charCount} chars, ${uttCount} utterances, ${sentCount} sentiment results`);
  } catch (err) {
    process.stdout.write("\n");
    console.error(`  Error: ${err.message}`);
    await upsertStatus(callId, { status: "error", error_message: err.message });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("AssemblyAI Transcription Pipeline");
  console.log("==================================");
  if (DRY_RUN) console.log("DRY RUN — no API calls will be made\n");

  // Fetch all completed call_ids from experiment_responses
  const { data: responses, error: rErr } = await supabase
    .from("experiment_responses")
    .select("call_id")
    .not("call_id", "is", null);

  if (rErr) {
    console.error("Failed to fetch experiment_responses:", rErr.message);
    process.exit(1);
  }

  const allCallIds = [...new Set(responses.map((r) => r.call_id).filter(Boolean))];
  console.log(`Total call_ids in experiment_responses: ${allCallIds.length}`);

  // Fetch already-processed entries
  const { data: existing } = await supabase
    .from("call_transcriptions_assemblyai")
    .select("call_id, status");

  const existingMap = new Map(existing?.map((e) => [e.call_id, e.status]) ?? []);

  const completed = allCallIds.filter((id) => existingMap.get(id) === "completed").length;
  const errored = allCallIds.filter((id) => existingMap.get(id) === "error").length;
  const noRecording = allCallIds.filter((id) => existingMap.get(id) === "no_recording").length;

  console.log(`Already completed: ${completed}, errored: ${errored}, no_recording: ${noRecording}`);

  // Determine which to process
  const toProcess = allCallIds
    .filter((id) => {
      const status = existingMap.get(id);
      if (!status) return true;              // never seen
      if (status === "error" && RETRY_ERRORS) return true;
      return false;
    })
    .slice(0, LIMIT);

  console.log(`To process this run: ${toProcess.length}\n`);

  if (DRY_RUN) {
    console.log("Would process:", toProcess);
    return;
  }

  if (toProcess.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // Process in batches of MAX_CONCURRENT
  let done = 0;
  for (let i = 0; i < toProcess.length; i += MAX_CONCURRENT) {
    const batch = toProcess.slice(i, i + MAX_CONCURRENT);
    console.log(`\n── Batch ${Math.floor(i / MAX_CONCURRENT) + 1} (${batch.length} calls) ──`);
    await Promise.all(batch.map((id) => processCall(id)));
    done += batch.length;
    console.log(`\nProgress: ${done}/${toProcess.length} processed`);
  }

  console.log("\n==================================");
  console.log("Pipeline complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
