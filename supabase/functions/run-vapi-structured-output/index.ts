import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPI_STRUCTURED_OUTPUT_ID = "421185d2-5349-4acb-9444-2d6a0f67d154";
const ACTIVE_METRIC_SETTING_KEY = "active_vapi_evaluation_metric_id";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const body = await req.json();
    const callIds = body?.callIds;
    if (!Array.isArray(callIds) || callIds.length === 0) {
      return new Response(JSON.stringify({ error: "callIds array required and must not be empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metricId = typeof body?.metricId === "string" ? body.metricId.trim() : "";
    const structuredOutputIdOverride = typeof body?.structuredOutputId === "string" ? body.structuredOutputId.trim() : "";

    // Resolve metric + structuredOutputId:
    // 1) explicit structuredOutputId override
    // 2) explicit metricId
    // 3) active metric from experiment_settings
    // 4) env var fallback / constant
    let structuredOutputId: string | null = structuredOutputIdOverride || null;
    let resolvedMetricId: string | null = metricId || null;

    if (!structuredOutputId && resolvedMetricId) {
      const { data: metricRow } = await supabaseAdmin
        .from("vapi_evaluation_metrics")
        .select("structured_output_id")
        .eq("id", resolvedMetricId)
        .maybeSingle();
      const so = metricRow && (metricRow as Record<string, unknown>).structured_output_id;
      structuredOutputId = typeof so === "string" && so.trim() ? so.trim() : null;
    }

    if (!structuredOutputId && !resolvedMetricId) {
      const { data: settingRow } = await supabaseAdmin
        .from("experiment_settings")
        .select("setting_value")
        .eq("setting_key", ACTIVE_METRIC_SETTING_KEY)
        .maybeSingle();
      const activeMetricId = settingRow && (settingRow as Record<string, unknown>).setting_value;
      if (typeof activeMetricId === "string" && activeMetricId.trim()) {
        resolvedMetricId = activeMetricId.trim();
        const { data: metricRow } = await supabaseAdmin
          .from("vapi_evaluation_metrics")
          .select("structured_output_id")
          .eq("id", resolvedMetricId)
          .maybeSingle();
        const so = metricRow && (metricRow as Record<string, unknown>).structured_output_id;
        structuredOutputId = typeof so === "string" && so.trim() ? so.trim() : null;
      }
    }

    structuredOutputId = structuredOutputId ?? (Deno.env.get("VAPI_STRUCTURED_OUTPUT_ID") ?? VAPI_STRUCTURED_OUTPUT_ID);

    const vapiRes = await fetch("https://api.vapi.ai/structured-output/run", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        structuredOutputId,
        callIds,
      }),
    });

    if (!vapiRes.ok) {
      const errText = await vapiRes.text();
      console.error("VAPI structured-output/run error:", vapiRes.status, errText);
      return new Response(
        JSON.stringify({ error: "VAPI request failed", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vapiData = await vapiRes.json();
    const workflowId = vapiData?.workflowId ?? null;
    if (!workflowId) {
      return new Response(
        JSON.stringify({ error: "VAPI did not return workflowId", response: vapiData }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: insertedRun, error: insertError } = await supabaseAdmin
      .from("vapi_structured_output_runs")
      .insert({
        workflow_id: workflowId,
        call_ids: callIds,
        metric_id: resolvedMetricId || null,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to store run:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to store run", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        workflowId,
        runId: insertedRun?.id ?? null,
        callIds,
        message: "Evaluation started. Results usually appear in 1–2 minutes. Use \"Check for results\" or open Response Details.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("run-vapi-structured-output error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
