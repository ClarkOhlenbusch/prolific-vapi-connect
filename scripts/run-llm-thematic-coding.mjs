/**
 * LLM Thematic Coding Script (OpenAI API)
 * =========================================
 * Two-pass GPT analysis per participant:
 *   Pass A — Full call transcript → call_thematic_codes
 *   Pass B — Participant feedback text → experiment_responses feedback columns
 *
 * SETUP — run this SQL in Lovable's SQL editor FIRST:
 * ─────────────────────────────────────────────────────
 * -- Table: call_thematic_codes
 *   CREATE TABLE IF NOT EXISTS call_thematic_codes (
 *     call_id                       text PRIMARY KEY,
 *     comfort_score                 integer,       -- 1-5
 *     rapport_level                 text,          -- cold | neutral | warm | personal
 *     self_disclosure               boolean,       -- did user share personal info?
 *     user_initiated_topics         jsonb,         -- string[]
 *     notable_moments               jsonb,         -- string[]
 *     overall_conversation_quality  integer,       -- 1-5
 *     model_used                    text,
 *     created_at                    timestamptz NOT NULL DEFAULT now()
 *   );
 *
 * -- Columns on experiment_responses (add one by one in Lovable SQL editor):
 *   ALTER TABLE experiment_responses
 *     ADD COLUMN IF NOT EXISTS feedback_sentiment             text,
 *     ADD COLUMN IF NOT EXISTS feedback_themes                jsonb,
 *     ADD COLUMN IF NOT EXISTS feedback_satisfaction_inferred integer,
 *     ADD COLUMN IF NOT EXISTS feedback_condition_perception  text;
 * ─────────────────────────────────────────────────────
 *
 * USAGE:
 *   node --env-file=.env --env-file=.env.local scripts/run-llm-thematic-coding.mjs
 *
 * REQUIRED ENV VARS:
 *   VITE_SUPABASE_URL         — in .env
 *   SUPABASE_SERVICE_ROLE_KEY — in .env.local
 *   OPENAI_API_KEY            — in .env.local (get from platform.openai.com/api-keys)
 *
 * OPTIONS:
 *   --dry-run         Print prompts and parsed outputs without writing to DB
 *   --pass-a-only     Only run Pass A (transcript coding)
 *   --pass-b-only     Only run Pass B (feedback coding)
 *   --recompute       Re-run calls already coded
 *   --limit N         Process at most N participants
 *   --call-id <id>    Process a single call for debugging
 *
 * COST ESTIMATE (gpt-4o-mini):
 *   ~150 participants × 2 passes ≈ $0.10–0.30 total
 */

import { createClient } from "@supabase/supabase-js";

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Use gpt-4o-mini for cost efficiency; upgrade to gpt-4o if quality is insufficient
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 1024;

// Concurrency — one at a time to stay within API limits and control cost
const CONCURRENT = 1;

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PASS_A_ONLY = args.includes("--pass-a-only");
const PASS_B_ONLY = args.includes("--pass-b-only");
const RECOMPUTE = args.includes("--recompute");
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i !== -1 ? parseInt(args[i + 1], 10) : Infinity;
})();
const SINGLE_CALL = (() => {
  const i = args.indexOf("--call-id");
  return i !== -1 ? args[i + 1] : null;
})();

// ─── Validation ───────────────────────────────────────────────────────────────

const missing = [
  ["VITE_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_KEY],
  ["OPENAI_API_KEY", OPENAI_API_KEY],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error("Missing required env vars:", missing.join(", "));
  console.error("Add OPENAI_API_KEY=sk-... to your .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── OpenAI API ───────────────────────────────────────────────────────────────

async function callOpenAI(systemPrompt, userContent) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`OpenAI API ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? "";

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Failed to parse OpenAI JSON: ${e.message}\nRaw: ${text.slice(0, 200)}`);
  }
}

// ─── Pass A: Transcript thematic coding ──────────────────────────────────────

const PASS_A_SYSTEM = `You are a qualitative researcher coding voice conversation transcripts.
Analyze the conversation and return ONLY valid JSON matching this schema exactly:

{
  "comfort_score": <integer 1-5>,
  "rapport_level": "<cold|neutral|warm|personal>",
  "self_disclosure": <true|false>,
  "user_initiated_topics": ["<topic>", ...],
  "notable_moments": ["<brief description>", ...],
  "overall_conversation_quality": <integer 1-5>
}

Definitions:
- comfort_score: How comfortable the user seemed overall (1=very uncomfortable, 5=very comfortable)
- rapport_level: Quality of connection between user and AI
  - cold: Purely transactional, minimal engagement
  - neutral: Polite but no warmth
  - warm: Friendly exchanges, some personal engagement
  - personal: User shared personal info or emotional content
- self_disclosure: true if user voluntarily shared personal information, feelings, or experiences
- user_initiated_topics: Topics the user brought up (not AI-prompted); include 0-5 items
- notable_moments: Any memorable exchanges — humor, vulnerability, disagreement, confusion; include 0-3 items
- overall_conversation_quality: Overall quality of the conversation (1=poor, 5=excellent)

Return ONLY the JSON object. No explanation.`;

async function runPassA(callId, transcriptText, utterances) {
  // Build a readable transcript from utterances
  let transcript;
  if (utterances && utterances.length > 0) {
    transcript = utterances
      .map((u) => `${u.speaker === "A" ? "AI" : "User"}: ${u.text}`)
      .join("\n");
  } else {
    transcript = transcriptText ?? "(no transcript available)";
  }

  const userContent = `Conversation transcript:\n\n${transcript}`;

  const result = await callOpenAI(PASS_A_SYSTEM, userContent);

  // Validate and clamp numeric fields
  return {
    call_id: callId,
    comfort_score: Math.min(5, Math.max(1, parseInt(result.comfort_score) || 3)),
    rapport_level: ["cold", "neutral", "warm", "personal"].includes(result.rapport_level)
      ? result.rapport_level
      : "neutral",
    self_disclosure: Boolean(result.self_disclosure),
    user_initiated_topics: Array.isArray(result.user_initiated_topics)
      ? result.user_initiated_topics.slice(0, 10)
      : [],
    notable_moments: Array.isArray(result.notable_moments)
      ? result.notable_moments.slice(0, 10)
      : [],
    overall_conversation_quality: Math.min(5, Math.max(1, parseInt(result.overall_conversation_quality) || 3)),
    model_used: OPENAI_MODEL,
    created_at: new Date().toISOString(),
  };
}

// ─── Pass B: Feedback thematic coding ────────────────────────────────────────

const PASS_B_SYSTEM = `You are a qualitative researcher coding participant feedback about a voice AI assistant.
Analyze the feedback and return ONLY valid JSON matching this schema exactly:

{
  "feedback_sentiment": "<positive|neutral|negative>",
  "feedback_themes": ["<theme>", ...],
  "feedback_satisfaction_inferred": <integer 1-5>,
  "feedback_condition_perception": "<brief description of how they describe the assistant's style>"
}

Definitions:
- feedback_sentiment: Overall emotional tone of the feedback
- feedback_themes: Key themes mentioned (max 8). Use short labels like:
  "natural", "robotic", "helpful", "unhelpful", "friendly", "formal", "informal",
  "clear", "confusing", "repetitive", "engaging", "boring", "privacy concern",
  "trustworthy", "untrustworthy", "empathetic", "cold"
  (add new labels if needed, keep them short and consistent)
- feedback_satisfaction_inferred: Inferred satisfaction (1=very dissatisfied, 5=very satisfied)
- feedback_condition_perception: 1-2 sentences describing how they perceived the assistant's style/personality

If feedback is empty or too short to code, return:
{ "feedback_sentiment": "neutral", "feedback_themes": [], "feedback_satisfaction_inferred": 3, "feedback_condition_perception": "insufficient feedback" }

Return ONLY the JSON object. No explanation.`;

async function runPassB(callId, feedbackText) {
  const combined = feedbackText.trim();
  if (!combined || combined.length < 5) {
    return {
      feedback_sentiment: "neutral",
      feedback_themes: [],
      feedback_satisfaction_inferred: 3,
      feedback_condition_perception: "insufficient feedback",
    };
  }

  const userContent = `Participant feedback:\n\n${combined}`;
  const result = await callOpenAI(PASS_B_SYSTEM, userContent);

  return {
    feedback_sentiment: ["positive", "neutral", "negative"].includes(result.feedback_sentiment)
      ? result.feedback_sentiment
      : "neutral",
    feedback_themes: Array.isArray(result.feedback_themes)
      ? result.feedback_themes.slice(0, 15)
      : [],
    feedback_satisfaction_inferred: Math.min(5, Math.max(1, parseInt(result.feedback_satisfaction_inferred) || 3)),
    feedback_condition_perception: typeof result.feedback_condition_perception === "string"
      ? result.feedback_condition_perception.slice(0, 500)
      : null,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("LLM Thematic Coding (Claude API)");
  console.log("=================================");
  if (DRY_RUN) console.log("DRY RUN — outputs will be printed but not saved\n");
  if (PASS_A_ONLY) console.log("Mode: Pass A only (transcript coding)");
  if (PASS_B_ONLY) console.log("Mode: Pass B only (feedback coding)");

  // Fetch completed transcriptions
  let transcriptionQuery = supabase
    .from("call_transcriptions_assemblyai")
    .select("call_id, transcript_text, utterances")
    .eq("status", "completed");

  if (SINGLE_CALL) transcriptionQuery = transcriptionQuery.eq("call_id", SINGLE_CALL);

  const { data: transcriptions, error: tErr } = await transcriptionQuery;
  if (tErr) {
    console.error("Failed to fetch transcriptions:", tErr.message);
    process.exit(1);
  }

  // Fetch experiment_responses for feedback text and assistant_type
  let responseQuery = supabase
    .from("experiment_responses")
    .select("call_id, voice_assistant_feedback, communication_style_feedback, experiment_feedback");

  if (SINGLE_CALL) responseQuery = responseQuery.eq("call_id", SINGLE_CALL);

  const { data: responses, error: rErr } = await responseQuery;
  if (rErr) {
    console.error("Failed to fetch experiment_responses:", rErr.message);
    process.exit(1);
  }

  const responseMap = new Map(responses?.map((r) => [r.call_id, r]) ?? []);

  // Fetch already-coded call_ids (unless --recompute)
  let alreadyCodedA = new Set();
  let alreadyCodedB = new Set();
  if (!RECOMPUTE) {
    const { data: existingA } = await supabase
      .from("call_thematic_codes")
      .select("call_id");
    alreadyCodedA = new Set(existingA?.map((r) => r.call_id) ?? []);

    const { data: existingB } = await supabase
      .from("experiment_responses")
      .select("call_id")
      .not("feedback_sentiment", "is", null);
    alreadyCodedB = new Set(existingB?.map((r) => r.call_id) ?? []);

    console.log(`Already coded — Pass A: ${alreadyCodedA.size}, Pass B: ${alreadyCodedB.size}`);
  }

  // Build work list
  const allCallIds = [...new Set(transcriptions.map((t) => t.call_id))];
  const toProcess = allCallIds
    .filter((id) => {
      const needsA = !PASS_B_ONLY && (RECOMPUTE || !alreadyCodedA.has(id));
      const needsB = !PASS_A_ONLY && (RECOMPUTE || !alreadyCodedB.has(id));
      return needsA || needsB;
    })
    .slice(0, LIMIT);

  console.log(`Total transcriptions: ${transcriptions.length}`);
  console.log(`To process this run: ${toProcess.length}\n`);

  if (toProcess.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const transMap = new Map(transcriptions.map((t) => [t.call_id, t]));

  let successA = 0, failA = 0, successB = 0, failB = 0;

  for (const callId of toProcess) {
    const trans = transMap.get(callId);
    const resp = responseMap.get(callId);

    console.log(`\n[${callId}]`);

    // ── Pass A ──────────────────────────────────────────────────────────────
    const runA = !PASS_B_ONLY && (RECOMPUTE || !alreadyCodedA.has(callId));
    if (runA && trans) {
      process.stdout.write("  Pass A (transcript)... ");
      try {
        const row = await runPassA(callId, trans.transcript_text, trans.utterances);

        if (DRY_RUN) {
          console.log("\n  " + JSON.stringify(row, null, 2));
          successA++;
        } else {
          const { error: uErr } = await supabase
            .from("call_thematic_codes")
            .upsert(row, { onConflict: "call_id" });

          if (uErr) {
            console.log(`FAIL — ${uErr.message}`);
            failA++;
          } else {
            console.log(`ok (comfort=${row.comfort_score}, rapport=${row.rapport_level})`);
            successA++;
          }
        }
      } catch (err) {
        console.log(`ERROR — ${err.message}`);
        failA++;
      }
    }

    // ── Pass B ──────────────────────────────────────────────────────────────
    const runB = !PASS_A_ONLY && (RECOMPUTE || !alreadyCodedB.has(callId));
    if (runB && resp) {
      process.stdout.write("  Pass B (feedback)... ");

      // Combine all feedback fields
      const feedbackParts = [
        resp.voice_assistant_feedback,
        resp.communication_style_feedback,
        resp.experiment_feedback,
      ].filter(Boolean);
      const feedbackText = feedbackParts.join("\n\n---\n\n");

      try {
        const coded = await runPassB(callId, feedbackText);

        if (DRY_RUN) {
          console.log("\n  " + JSON.stringify(coded, null, 2));
          successB++;
        } else {
          const { error: uErr } = await supabase
            .from("experiment_responses")
            .update(coded)
            .eq("call_id", callId);

          if (uErr) {
            console.log(`FAIL — ${uErr.message}`);
            failB++;
          } else {
            console.log(`ok (sentiment=${coded.feedback_sentiment}, themes=${coded.feedback_themes.join(", ")})`);
            successB++;
          }
        }
      } catch (err) {
        console.log(`ERROR — ${err.message}`);
        failB++;
      }
    }
  }

  console.log("\n=================================");
  console.log(`Pass A: ${successA} ok, ${failA} failed`);
  console.log(`Pass B: ${successB} ok, ${failB} failed`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
