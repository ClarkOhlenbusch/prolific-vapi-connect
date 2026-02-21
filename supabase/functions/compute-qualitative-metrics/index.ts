/**
 * Qualitative Metrics Computation Script
 * =======================================
 * Reads completed AssemblyAI transcriptions and computes per-call engagement
 * and sentiment features. Writes results to `call_qualitative_metrics`.
 *
 * SETUP — run this SQL in Lovable's SQL editor FIRST:
 * ─────────────────────────────────────────────────────
 *   CREATE TABLE IF NOT EXISTS call_qualitative_metrics (
 *     call_id                  text PRIMARY KEY,
 *     assistant_type           text,
 *     user_sentiment_mean      float,
 *     user_sentiment_std       float,
 *     sentiment_arc_early      float,
 *     sentiment_arc_mid        float,
 *     sentiment_arc_late       float,
 *     sentiment_positive_pct   float,
 *     sentiment_negative_pct   float,
 *     sentiment_neutral_pct    float,
 *     user_word_count          integer,
 *     user_turn_count          integer,
 *     user_words_per_turn      float,
 *     user_speaking_time_ms    integer,
 *     speaking_time_ratio      float,
 *     ai_word_count            integer,
 *     ai_turn_count            integer,
 *     total_duration_ms        integer,
 *     created_at               timestamptz NOT NULL DEFAULT now()
 *   );
 * ─────────────────────────────────────────────────────
 *
 * USAGE:
 *   node --env-file=.env --env-file=.env.local scripts/compute-qualitative-metrics.mjs
 *
 * REQUIRED ENV VARS:
 *   VITE_SUPABASE_URL         — in .env
 *   SUPABASE_SERVICE_ROLE_KEY — in .env.local
 *
 * OPTIONS:
 *   --dry-run     Print computed metrics without writing to DB
 *   --recompute   Recompute calls already in call_qualitative_metrics
 *   --limit N     Process at most N calls this run
 *
 * SPEAKER ASSUMPTION:
 *   AssemblyAI labels speakers in order of first appearance.
 *   In Vapi calls the AI assistant speaks first (greeting), so:
 *     Speaker A = AI assistant
 *     Speaker B = User
 *   If your setup differs, set FIRST_SPEAKER_IS_USER=true below.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Set to true if the user (not AI) speaks first in your recordings
const FIRST_SPEAKER_IS_USER = false;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RECOMPUTE = args.includes("--recompute");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i !== -1 ? parseInt(args[i + 1], 10) : Infinity;
})();

// ─── Validation ───────────────────────────────────────────────────────────────

const missing = [
  ["VITE_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_KEY],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length) {
  console.error("Missing required env vars:", missing.join(", "));
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Sentiment helpers ────────────────────────────────────────────────────────

/** Maps AssemblyAI sentiment string to numeric score (-1, 0, +1) */
function sentimentToScore(sentiment) {
  if (sentiment === "POSITIVE") return 1;
  if (sentiment === "NEGATIVE") return -1;
  return 0; // NEUTRAL or unknown
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  const variance = arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

/** Count words in a string (split on whitespace) */
function wordCount(text) {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Given utterances array from AssemblyAI, compute all qualitative metrics.
 * Utterances format: { speaker, text, start, end, words, sentiment?, confidence? }
 *
 * Note: AssemblyAI sentiment_analysis_results is per-sentence; we use per-utterance
 * sentiment from the utterances array (each utterance has a sentiment field when
 * sentiment_analysis is enabled).
 */
function computeMetrics(utterances, sentimentResults, audioDurationMs) {
  if (!utterances || utterances.length === 0) return null;

  // Determine which speaker label is the user
  const firstSpeaker = utterances[0].speaker; // A if AI speaks first
  const userSpeaker = FIRST_SPEAKER_IS_USER ? firstSpeaker : firstSpeaker === "A" ? "B" : "A";
  const aiSpeaker = FIRST_SPEAKER_IS_USER ? (firstSpeaker === "A" ? "B" : "A") : firstSpeaker;

  const userUtterances = utterances.filter((u) => u.speaker === userSpeaker);
  const aiUtterances = utterances.filter((u) => u.speaker === aiSpeaker);

  // ── Sentiment (from per-utterance sentiment if available, else from sentiment_results) ──

  // Try utterance-level sentiment first
  let userSentimentScores = userUtterances.filter((u) => u.sentiment).map((u) => sentimentToScore(u.sentiment));

  // Fallback: use sentiment_results (per-sentence, may include both speakers)
  // sentiment_results items: { text, start, end, sentiment, confidence, speaker }
  if (userSentimentScores.length === 0 && sentimentResults?.length) {
    userSentimentScores = sentimentResults
      .filter((r) => r.speaker === userSpeaker)
      .map((r) => sentimentToScore(r.sentiment));
  }

  const sentimentMean = mean(userSentimentScores);
  const sentimentStd = std(userSentimentScores);

  // Sentiment percentages
  const total = userSentimentScores.length;
  const posCount = userSentimentScores.filter((s) => s === 1).length;
  const negCount = userSentimentScores.filter((s) => s === -1).length;
  const neutCount = userSentimentScores.filter((s) => s === 0).length;

  const sentimentPositivePct = total ? posCount / total : null;
  const sentimentNegativePct = total ? negCount / total : null;
  const sentimentNeutralPct = total ? neutCount / total : null;

  // Sentiment arc — split user turns into thirds
  const third = Math.ceil(userSentimentScores.length / 3) || 1;
  const early = userSentimentScores.slice(0, third);
  const mid = userSentimentScores.slice(third, third * 2);
  const late = userSentimentScores.slice(third * 2);

  const sentimentArcEarly = mean(early);
  const sentimentArcMid = mean(mid); // mean([]) returns null safely
  const sentimentArcLate = mean(late); // mean([]) returns null safely

  // ── Engagement metrics ──────────────────────────────────────────────────────

  const userWordCount = userUtterances.reduce((acc, u) => acc + wordCount(u.text), 0);
  const aiWordCount = aiUtterances.reduce((acc, u) => acc + wordCount(u.text), 0);
  const totalWords = userWordCount + aiWordCount;

  const userTurnCount = userUtterances.length;
  const aiTurnCount = aiUtterances.length;

  const userWordsPerTurn = userTurnCount > 0 ? userWordCount / userTurnCount : null;

  // Speaking time in ms
  const userSpeakingTimeMs = userUtterances.reduce((acc, u) => {
    const duration = (u.end ?? 0) - (u.start ?? 0);
    return acc + (duration > 0 ? duration : 0);
  }, 0);

  const speakingTimeRatio = totalWords > 0 ? userWordCount / totalWords : null;

  return {
    user_sentiment_mean: sentimentMean,
    user_sentiment_std: sentimentStd,
    sentiment_arc_early: sentimentArcEarly,
    sentiment_arc_mid: sentimentArcMid,
    sentiment_arc_late: sentimentArcLate,
    sentiment_positive_pct: sentimentPositivePct,
    sentiment_negative_pct: sentimentNegativePct,
    sentiment_neutral_pct: sentimentNeutralPct,
    user_word_count: userWordCount,
    user_turn_count: userTurnCount,
    user_words_per_turn: userWordsPerTurn,
    user_speaking_time_ms: userSpeakingTimeMs,
    speaking_time_ratio: speakingTimeRatio,
    ai_word_count: aiWordCount,
    ai_turn_count: aiTurnCount,
    total_duration_ms: audioDurationMs ?? null,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Qualitative Metrics Computation");
  console.log("================================");
  if (DRY_RUN) console.log("DRY RUN — metrics will be printed but not saved\n");

  // Fetch completed transcriptions
  const { data: transcriptions, error: tErr } = await supabase
    .from("call_transcriptions_assemblyai")
    .select("call_id, utterances, sentiment_results, audio_duration_ms")
    .eq("status", "completed")
    .not("utterances", "is", null);

  if (tErr) {
    console.error("Failed to fetch transcriptions:", tErr.message);
    process.exit(1);
  }

  console.log(`Completed transcriptions: ${transcriptions.length}`);

  // Fetch already-computed call_ids (unless --recompute)
  let alreadyDone = new Set();
  if (!RECOMPUTE) {
    const { data: existing } = await supabase.from("call_qualitative_metrics").select("call_id");
    alreadyDone = new Set(existing?.map((r) => r.call_id) ?? []);
    console.log(`Already computed: ${alreadyDone.size}`);
  }

  // Fetch assistant_type from experiment_responses
  const { data: responses } = await supabase
    .from("experiment_responses")
    .select("call_id, ai_formality_score, assistant_type");

  const responseMap = new Map(responses?.map((r) => [r.call_id, r]) ?? []);

  // Filter to what we need to process
  const toProcess = transcriptions.filter((t) => RECOMPUTE || !alreadyDone.has(t.call_id)).slice(0, LIMIT);

  console.log(`To compute this run: ${toProcess.length}\n`);

  if (toProcess.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (const t of toProcess) {
    const { call_id, utterances, sentiment_results, audio_duration_ms } = t;
    process.stdout.write(`[${call_id}] Computing... `);

    try {
      const metrics = computeMetrics(utterances, sentiment_results, audio_duration_ms);

      if (!metrics) {
        console.log("skip (no utterances)");
        continue;
      }

      // Determine assistant_type
      const resp = responseMap.get(call_id);
      let assistantType = resp?.assistant_type ?? null;
      if (!assistantType && resp?.ai_formality_score != null) {
        // Derive from formality score if direct field not present
        // Threshold: 0.5 → formal; <0.5 → informal (adjust if needed)
        assistantType = resp.ai_formality_score >= 0.5 ? "formal" : "informal";
      }

      const row = {
        call_id,
        assistant_type: assistantType,
        ...metrics,
        created_at: new Date().toISOString(),
      };

      if (DRY_RUN) {
        console.log("\n  ", JSON.stringify(row, null, 2));
        succeeded++;
        continue;
      }

      const { error: uErr } = await supabase.from("call_qualitative_metrics").upsert(row, { onConflict: "call_id" });

      if (uErr) {
        console.log(`FAIL — ${uErr.message}`);
        failed++;
      } else {
        const sentStr = metrics.user_sentiment_mean != null ? metrics.user_sentiment_mean.toFixed(3) : "n/a";
        console.log(`ok (sentiment_mean=${sentStr}, turns=${metrics.user_turn_count})`);
        succeeded++;
      }
    } catch (err) {
      console.log(`ERROR — ${err.message}`);
      failed++;
    }
  }

  console.log("\n================================");
  console.log(`Done: ${succeeded} computed, ${failed} failed.`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
