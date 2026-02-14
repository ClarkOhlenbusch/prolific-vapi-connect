import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );

    const {
      data: { user: callingUser },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !callingUser) {
      return new Response(JSON.stringify({ error: "Invalid user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("researcher_roles")
      .select("role")
      .eq("user_id", callingUser.id)
      .single();

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("VAPI_PRIVATE_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "VAPI_PRIVATE_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    let callIds: string[] = body?.callIds;

    if (!callIds || !Array.isArray(callIds)) {
      const runId = body?.runId;
      if (runId) {
        const { data: run, error: runErr } = await supabaseAdmin
          .from("vapi_structured_output_runs")
          .select("call_ids")
          .eq("id", runId)
          .single();
        if (runErr || !run) {
          return new Response(JSON.stringify({ error: "Run not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        callIds = run.call_ids ?? [];
      }
    }

    if (!callIds || callIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Provide callIds array or runId to fetch results for" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();
    let updatedAny = 0;
    let updatedEvaluation = 0;
    let updatedStructuredOutputs = 0;

    // If invoked with runId, we can attribute persisted results to the metric version for staleness detection.
    const runId = body?.runId;
    let runMetricId: string | null = null;
    if (runId) {
      const { data: runRow } = await supabaseAdmin
        .from("vapi_structured_output_runs")
        .select("metric_id")
        .eq("id", runId)
        .maybeSingle();
      runMetricId = (runRow && typeof (runRow as Record<string, unknown>).metric_id === "string")
        ? String((runRow as Record<string, unknown>).metric_id)
        : null;
    }

    for (const callId of callIds) {
      const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) continue;
      const call = await res.json();

      const structuredOutputsRawCandidate =
        call?.artifact?.structuredOutputs ?? call?.analysis?.structuredOutputs ?? null;

      const structuredOutputsRaw = isPlainObject(structuredOutputsRawCandidate)
        ? structuredOutputsRawCandidate
        : null;

      let evaluationCandidate: Record<string, unknown> | null = null;
      const structuredDataCandidate = call?.analysis?.structuredData ?? null;
      if (isPlainObject(structuredDataCandidate)) {
        evaluationCandidate = structuredDataCandidate;
      } else if (structuredOutputsRaw) {
        const first = Object.values(structuredOutputsRaw)[0] as unknown;
        const firstObj = isPlainObject(first) ? first : null;
        const firstResult = firstObj && isPlainObject(firstObj.result) ? (firstObj.result as Record<string, unknown>) : null;
        if (firstResult) evaluationCandidate = firstResult;
      }

      const updatePayload: Record<string, unknown> = {};
      if (evaluationCandidate) {
        updatePayload.vapi_structured_output = evaluationCandidate;
        updatePayload.vapi_structured_output_at = now;

        // Store a lightweight score for fast dashboard rendering.
        const totalScoreCandidate = (evaluationCandidate as Record<string, unknown>).total_score;
        if (typeof totalScoreCandidate === "number" && Number.isFinite(totalScoreCandidate)) {
          updatePayload.vapi_total_score = Math.trunc(totalScoreCandidate);
        }
        // Attribute to metric version when available (run-scoped fetch).
        if (runMetricId) updatePayload.vapi_evaluation_metric_id = runMetricId;
      }
      if (structuredOutputsRaw) {
        updatePayload.vapi_structured_outputs = structuredOutputsRaw;
        updatePayload.vapi_structured_outputs_at = now;
      }

      if (Object.keys(updatePayload).length === 0) continue;

      const { error: updateErr } = await supabaseAdmin
        .from("experiment_responses")
        .update(updatePayload)
        .eq("call_id", callId);

      if (!updateErr) {
        updatedAny += 1;
        if (evaluationCandidate) updatedEvaluation += 1;
        if (structuredOutputsRaw) updatedStructuredOutputs += 1;
      }
    }

    if (runId && callIds.length > 0) {
      const status = updatedAny === callIds.length ? "completed" : updatedAny > 0 ? "partial" : "pending";
      await supabaseAdmin
        .from("vapi_structured_output_runs")
        .update({ status, updated_at: now })
        .eq("id", runId);
    }

    return new Response(
      JSON.stringify({
        updated: updatedAny,
        updatedEvaluation,
        updatedStructuredOutputs,
        total: callIds.length,
        message: updatedAny === callIds.length
          ? `All ${callIds.length} calls updated.`
          : `Updated ${updatedAny} of ${callIds.length} calls. Others may still be processing.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("fetch-vapi-structured-output-results error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
