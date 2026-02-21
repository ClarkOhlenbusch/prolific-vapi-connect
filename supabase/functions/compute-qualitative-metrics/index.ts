/**
 * compute-qualitative-metrics
 * ────────────────────────────
 * Reads completed AssemblyAI utterances and derives per-call engagement +
 * sentiment features. Writes to call_qualitative_metrics. No external API
 * calls — pure computation from existing data.
 *
 * SQL to run in Lovable FIRST:
 * ────────────────────────────────────────────────────────────────────────────
 *   CREATE TABLE IF NOT EXISTS call_qualitative_metrics (
 *     call_id                  text PRIMARY KEY,
 *     assistant_type           text,
 *     user_sentiment_mean      float, user_sentiment_std float,
 *     sentiment_arc_early      float, sentiment_arc_mid float, sentiment_arc_late float,
 *     sentiment_positive_pct   float, sentiment_negative_pct float, sentiment_neutral_pct float,
 *     user_word_count          integer, user_turn_count integer, user_words_per_turn float,
 *     user_speaking_time_ms    integer, speaking_time_ratio float,
 *     ai_word_count            integer, ai_turn_count integer, total_duration_ms integer,
 *     created_at               timestamptz NOT NULL DEFAULT now()
 *   );
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Called from Researcher UI. Processes up to `limit` calls per invocation.
 *
 * SPEAKER ASSUMPTION:
 *   In Vapi calls the AI greets first → Speaker A = AI, Speaker B = User.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainObj = Record<string, any>;

// ─── Math helpers ─────────────────────────────────────────────────────────────

function mean(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number | null {
  if (arr.length < 2) return null;
  const m = mean(arr)!;
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / arr.length);
}

function wordCount(text: string): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

function sentimentToScore(s: string): number {
  if (s === "POSITIVE") return 1;
  if (s === "NEGATIVE") return -1;
  return 0;
}

// ─── Core computation ─────────────────────────────────────────────────────────

function computeMetrics(
  utterances: PlainObj[],
  sentimentResults: PlainObj[] | null,
  audioDurationMs: number | null,
): PlainObj | null {
  if (!utterances.length) return null;

  // AI speaks first → Speaker A = AI, Speaker B = User
  const firstSpeaker = utterances[0].speaker as string;
  const userSpeaker = firstSpeaker === "A" ? "B" : "A";
  const aiSpeaker = firstSpeaker;

  const userUtts = utterances.filter((u) => u.speaker === userSpeaker);
  const aiUtts = utterances.filter((u) => u.speaker === aiSpeaker);

  // Sentiment scores — try utterance-level first, fall back to sentence-level
  let userScores: number[] = userUtts.filter((u) => u.sentiment).map((u) => sentimentToScore(u.sentiment as string));

  if (!userScores.length && sentimentResults?.length) {
    userScores = (sentimentResults as PlainObj[])
      .filter((r) => r.speaker === userSpeaker)
      .map((r) => sentimentToScore(r.sentiment as string));
  }

  const sentMean = mean(userScores);
  const sentStd = std(userScores);

  const total = userScores.length;
  const posCount = userScores.filter((s) => s === 1).length;
  const negCount = userScores.filter((s) => s === -1).length;
  const neutCount = userScores.filter((s) => s === 0).length;

  // Sentiment arc — early / mid / late thirds
  const third = Math.max(1, Math.ceil(userScores.length / 3));
  const arcEarly = mean(userScores.slice(0, third));
  const arcMid = mean(userScores.slice(third, third * 2));
  const arcLate = mean(userScores.slice(third * 2));

  // Engagement
  const userWordCount = userUtts.reduce((acc, u) => acc + wordCount(u.text as string), 0);
  const aiWordCount = aiUtts.reduce((acc, u) => acc + wordCount(u.text as string), 0);
  const totalWords = userWordCount + aiWordCount;

  const userTurnCount = userUtts.length;
  const aiTurnCount = aiUtts.length;
  const userWordsPerTurn = userTurnCount > 0 ? userWordCount / userTurnCount : null;

  const userSpeakingTimeMs = userUtts.reduce((acc, u) => {
    const dur = (u.end ?? 0) - (u.start ?? 0);
    return acc + (dur > 0 ? dur : 0);
  }, 0);

  const speakingTimeRatio = totalWords > 0 ? userWordCount / totalWords : null;

  return {
    user_sentiment_mean: sentMean,
    user_sentiment_std: sentStd,
    sentiment_arc_early: arcEarly,
    sentiment_arc_mid: arcMid,
    sentiment_arc_late: arcLate,
    sentiment_positive_pct: total ? posCount / total : null,
    sentiment_negative_pct: total ? negCount / total : null,
    sentiment_neutral_pct: total ? neutCount / total : null,
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

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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
  const limit: number = typeof body.limit === "number" ? Math.min(body.limit, 50) : 25;
  const recompute: boolean = body.recompute === true;

  // ── Fetch completed transcriptions ────────────────────────────────────────
  const { data: transcriptions, error: tErr } = await supabaseAdmin
    .from("call_transcriptions_assemblyai")
    .select("call_id, utterances, sentiment_results, audio_duration_ms")
    .eq("status", "completed")
    .not("utterances", "is", null);

  if (tErr) {
    return new Response(JSON.stringify({ error: tErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Find already-computed call_ids ────────────────────────────────────────
  let alreadyDone = new Set<string>();
  if (!recompute) {
    const { data: existing } = await supabaseAdmin.from("call_qualitative_metrics").select("call_id");
    alreadyDone = new Set((existing ?? []).map((r: PlainObj) => r.call_id as string));
  }

  // ── Fetch assistant_type from experiment_responses ────────────────────────
  const { data: responses } = await supabaseAdmin
    .from("experiment_responses")
    .select("call_id, ai_formality_score, assistant_type");
  const responseMap = new Map<string, PlainObj>((responses ?? []).map((r: PlainObj) => [r.call_id as string, r]));

  const toProcess = (transcriptions ?? [])
    .filter((t: PlainObj) => recompute || !alreadyDone.has(t.call_id as string))
    .slice(0, limit);

  console.info(
    `[compute-qualitative-metrics] total=${(transcriptions ?? []).length} alreadyDone=${alreadyDone.size} toProcess=${toProcess.length} recompute=${recompute}`,
  );

  if (toProcess.length === 0) {
    return new Response(JSON.stringify({ computed: 0, errors: 0, total: 0, message: "All calls already computed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Process each call ─────────────────────────────────────────────────────
  let computed = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const t = toProcess[i] as PlainObj;
    const callId = t.call_id as string;

    console.info(`[compute-qualitative-metrics] [${i + 1}/${toProcess.length}] ${callId}`);

    try {
      const metrics = computeMetrics(
        (t.utterances as PlainObj[]) ?? [],
        (t.sentiment_results as PlainObj[] | null) ?? null,
        typeof t.audio_duration_ms === "number" ? t.audio_duration_ms : null,
      );

      if (!metrics) {
        console.info(`[compute-qualitative-metrics] ${callId}: skip (empty utterances)`);
        continue;
      }

      // Determine assistant_type
      const resp = responseMap.get(callId);
      let assistantType: string | null = resp?.assistant_type ?? null;
      if (!assistantType && resp?.ai_formality_score != null) {
        assistantType = (resp.ai_formality_score as number) >= 0.5 ? "formal" : "informal";
      }

      const { error: uErr } = await supabaseAdmin
        .from("call_qualitative_metrics")
        .upsert(
          { call_id: callId, assistant_type: assistantType, ...metrics, created_at: new Date().toISOString() },
          { onConflict: "call_id" },
        );

      if (uErr) {
        console.error(`[compute-qualitative-metrics] DB error ${callId}:`, uErr.message);
        errors++;
      } else {
        console.info(
          `[compute-qualitative-metrics] ${callId}: ok (sentiment_mean=${metrics.user_sentiment_mean?.toFixed(3)}, turns=${metrics.user_turn_count})`,
        );
        computed++;
      }
    } catch (err) {
      console.error(`[compute-qualitative-metrics] Error ${callId}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  console.info(`[compute-qualitative-metrics] Done: computed=${computed} errors=${errors}`);

  return new Response(JSON.stringify({ computed, errors, total: toProcess.length }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
