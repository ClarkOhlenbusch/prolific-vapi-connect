/**
 * run-thematic-coding
 * ────────────────────
 * Two-pass OpenAI thematic coding of call transcripts + participant feedback.
 *
 *   Pass A — transcript → call_thematic_codes
 *     (comfort_score, rapport_level, self_disclosure, user_initiated_topics,
 *      notable_moments, overall_conversation_quality)
 *
 *   Pass B — feedback text → experiment_responses
 *     (feedback_sentiment, feedback_themes, feedback_satisfaction_inferred,
 *      feedback_condition_perception)
 *
 * Requires in Lovable secrets:
 *   OPENAI_API_KEY — add in Lovable → Supabase → Secrets
 *
 * SQL to run in Lovable FIRST — see docs/qualitative-research-plan.md
 *
 * Called from Researcher UI. Processes up to `limit` calls per invocation.
 * Click repeatedly until all calls are coded.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObj = Record<string, any>;

const OPENAI_MODEL = "gpt-4o-mini";
const MAX_TOKENS = 1024;

// ─── OpenAI helper ────────────────────────────────────────────────────────────

async function callOpenAI(apiKey: string, systemPrompt: string, userContent: string): Promise<PlainObj> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  return JSON.parse(text);
}

// ─── Pass A prompt ────────────────────────────────────────────────────────────

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
- rapport_level: cold=purely transactional, neutral=polite, warm=friendly, personal=user shared personal info/feelings
- self_disclosure: true if user voluntarily shared personal information, feelings, or experiences
- user_initiated_topics: Topics the user brought up unprompted; 0-5 items, short labels
- notable_moments: Memorable exchanges — humor, vulnerability, disagreement, confusion; 0-3 items
- overall_conversation_quality: 1=poor, 5=excellent

Return ONLY the JSON object.`;

// ─── Pass B prompt ────────────────────────────────────────────────────────────

const PASS_B_SYSTEM = `You are a qualitative researcher coding participant feedback about a voice AI assistant.
Analyze the feedback and return ONLY valid JSON matching this schema exactly:

{
  "feedback_sentiment": "<positive|neutral|negative>",
  "feedback_themes": ["<theme>", ...],
  "feedback_satisfaction_inferred": <integer 1-5>,
  "feedback_condition_perception": "<brief description>"
}

Definitions:
- feedback_sentiment: Overall emotional tone of the feedback
- feedback_themes: Key themes, max 8 short labels e.g. "natural", "robotic", "helpful", "friendly",
  "formal", "informal", "clear", "confusing", "engaging", "boring", "empathetic", "cold",
  "trustworthy", "privacy concern" (add new labels as needed, keep them short)
- feedback_satisfaction_inferred: Inferred satisfaction 1=very dissatisfied, 5=very satisfied
- feedback_condition_perception: 1-2 sentences on how they perceived the assistant's style/personality

If feedback is too short to code meaningfully, return:
{ "feedback_sentiment": "neutral", "feedback_themes": [], "feedback_satisfaction_inferred": 3, "feedback_condition_perception": "insufficient feedback" }

Return ONLY the JSON object.`;

// ─── Clamp helpers ────────────────────────────────────────────────────────────

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = parseInt(String(val));
  return isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
}

function oneOf<T extends string>(val: unknown, options: T[], fallback: T): T {
  return options.includes(val as T) ? (val as T) : fallback;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

  if (!openaiApiKey) {
    return new Response(
      JSON.stringify({ error: "Missing secret: OPENAI_API_KEY not set in Lovable → Supabase → Secrets" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Auth: require researcher role ─────────────────────────────────────────
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

  const { data: userData, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid user session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: roleData } = await supabaseAdmin
    .from("researcher_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!roleData) {
    return new Response(JSON.stringify({ error: "Forbidden: researcher role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  const body: PlainObj = await req.json().catch(() => ({}));
  const limit: number = typeof body.limit === "number" ? Math.min(body.limit, 20) : 10;
  const recompute: boolean = body.recompute === true;
  const passAOnly: boolean = body.passAOnly === true;
  const passBOnly: boolean = body.passBOnly === true;

  // ── Fetch current thematic coding rules version ────────────────────────────
  const { data: settingRow } = await supabaseAdmin
    .from("experiment_settings")
    .select("setting_value")
    .eq("setting_key", "thematic_coding_rules_version")
    .maybeSingle();
  const currentRulesVersion: number = settingRow ? parseInt(String(settingRow.setting_value)) || 1 : 1;

  // ── Find completed transcriptions ─────────────────────────────────────────
  const { data: transcriptions } = await supabaseAdmin
    .from("call_transcriptions_assemblyai")
    .select("call_id, transcript_text, utterances")
    .eq("status", "completed")
    .not("utterances", "is", null);

  const allCallIds: string[] = (transcriptions ?? []).map((t: PlainObj) => t.call_id as string);
  const transMap = new Map<string, PlainObj>((transcriptions ?? []).map((t: PlainObj) => [t.call_id, t]));

  // ── Determine which need coding ───────────────────────────────────────────
  let alreadyCodedA = new Set<string>();
  let alreadyCodedB = new Set<string>();

  if (!recompute) {
    const { data: existingA } = await supabaseAdmin
      .from("call_thematic_codes")
      .select("call_id, rules_version");
    // Only count as "already coded" if rules_version is current (not stale)
    alreadyCodedA = new Set(
      (existingA ?? [])
        .filter((r: PlainObj) => ((r.rules_version as number) ?? 0) >= currentRulesVersion)
        .map((r: PlainObj) => r.call_id as string),
    );

    const { data: existingB } = await supabaseAdmin
      .from("experiment_responses")
      .select("call_id, feedback_rules_version")
      .not("feedback_sentiment", "is", null);
    // Only count as "already coded" if feedback_rules_version is current
    alreadyCodedB = new Set(
      (existingB ?? [])
        .filter((r: PlainObj) => ((r.feedback_rules_version as number) ?? 0) >= currentRulesVersion)
        .map((r: PlainObj) => r.call_id as string),
    );
  }

  // Fetch feedback text for all calls
  const { data: responses } = await supabaseAdmin
    .from("experiment_responses")
    .select("call_id, voice_assistant_feedback, communication_style_feedback, experiment_feedback");
  const responseMap = new Map<string, PlainObj>((responses ?? []).map((r: PlainObj) => [r.call_id, r]));

  const toProcess = allCallIds
    .filter((id) => {
      const needsA = !passBOnly && (recompute || !alreadyCodedA.has(id));
      const needsB = !passAOnly && (recompute || !alreadyCodedB.has(id));
      return needsA || needsB;
    })
    .slice(0, limit);

  console.info(
    `[run-thematic-coding] ${toProcess.length} to process (alreadyA=${alreadyCodedA.size}, alreadyB=${alreadyCodedB.size})`,
  );

  if (toProcess.length === 0) {
    return new Response(JSON.stringify({ processed: 0, errors: 0, message: "All calls already coded" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Process each call ─────────────────────────────────────────────────────
  const results: PlainObj[] = [];

  for (const callId of toProcess) {
    const trans = transMap.get(callId);
    const resp = responseMap.get(callId);
    const result: PlainObj = { callId, passA: null, passB: null };

    // ── Pass A: transcript → call_thematic_codes ──────────────────────────
    const runA = !passBOnly && (recompute || !alreadyCodedA.has(callId));
    if (runA && trans) {
      try {
        // Build readable transcript from utterances
        let transcript: string;
        const utterances = trans.utterances as PlainObj[] | null;
        if (utterances && utterances.length > 0) {
          transcript = utterances.map((u) => `${u.speaker === "A" ? "AI" : "User"}: ${u.text}`).join("\n");
        } else {
          transcript = trans.transcript_text ?? "(no transcript)";
        }

        const raw = await callOpenAI(openaiApiKey, PASS_A_SYSTEM, `Conversation transcript:\n\n${transcript}`);

        const row: PlainObj = {
          call_id: callId,
          comfort_score: clampInt(raw.comfort_score, 1, 5, 3),
          rapport_level: oneOf(raw.rapport_level, ["cold", "neutral", "warm", "personal"], "neutral"),
          self_disclosure: Boolean(raw.self_disclosure),
          user_initiated_topics: Array.isArray(raw.user_initiated_topics) ? raw.user_initiated_topics.slice(0, 10) : [],
          notable_moments: Array.isArray(raw.notable_moments) ? raw.notable_moments.slice(0, 10) : [],
          overall_conversation_quality: clampInt(raw.overall_conversation_quality, 1, 5, 3),
          model_used: OPENAI_MODEL,
          rules_version: currentRulesVersion,
          created_at: new Date().toISOString(),
        };

        const { error: uErr } = await supabaseAdmin.from("call_thematic_codes").upsert(row, { onConflict: "call_id" });

        result.passA = uErr ? `db_error: ${uErr.message}` : "ok";
        console.info(`[run-thematic-coding] Pass A ${callId}: ${result.passA}`);
      } catch (err) {
        result.passA = `error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[run-thematic-coding] Pass A error ${callId}:`, result.passA);
      }
    }

    // ── Pass B: feedback → experiment_responses ───────────────────────────
    const runB = !passAOnly && (recompute || !alreadyCodedB.has(callId));
    if (runB && resp) {
      try {
        const feedbackParts = [
          resp.voice_assistant_feedback,
          resp.communication_style_feedback,
          resp.experiment_feedback,
        ].filter(Boolean);
        const feedbackText: string = feedbackParts.join("\n\n---\n\n").trim();

        let coded: PlainObj;
        if (feedbackText.length < 5) {
          coded = {
            feedback_sentiment: "neutral",
            feedback_themes: [],
            feedback_satisfaction_inferred: 3,
            feedback_condition_perception: "insufficient feedback",
            feedback_rules_version: currentRulesVersion,
          };
        } else {
          const raw = await callOpenAI(openaiApiKey, PASS_B_SYSTEM, `Participant feedback:\n\n${feedbackText}`);
          coded = {
            feedback_sentiment: oneOf(raw.feedback_sentiment, ["positive", "neutral", "negative"], "neutral"),
            feedback_themes: Array.isArray(raw.feedback_themes) ? raw.feedback_themes.slice(0, 15) : [],
            feedback_satisfaction_inferred: clampInt(raw.feedback_satisfaction_inferred, 1, 5, 3),
            feedback_condition_perception:
              typeof raw.feedback_condition_perception === "string"
                ? raw.feedback_condition_perception.slice(0, 500)
                : null,
            feedback_rules_version: currentRulesVersion,
          };
        }

        const { error: uErr } = await supabaseAdmin.from("experiment_responses").update(coded).eq("call_id", callId);

        result.passB = uErr ? `db_error: ${uErr.message}` : "ok";
        console.info(`[run-thematic-coding] Pass B ${callId}: ${result.passB}`);
      } catch (err) {
        result.passB = `error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[run-thematic-coding] Pass B error ${callId}:`, result.passB);
      }
    }

    results.push(result);
  }

  const processed = results.filter((r) => r.passA === "ok" || r.passB === "ok").length;
  const errors = results.filter((r) => (r.passA && r.passA !== "ok") || (r.passB && r.passB !== "ok")).length;

  console.info(`[run-thematic-coding] Done: ${processed} processed, ${errors} errors`);

  return new Response(JSON.stringify({ processed, errors, total: toProcess.length, results, rulesVersion: currentRulesVersion }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
