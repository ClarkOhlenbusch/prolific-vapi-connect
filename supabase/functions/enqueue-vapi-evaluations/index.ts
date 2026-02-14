import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Authorization: super admin only
    const { data: roleData } = await supabaseAdmin
      .from("researcher_roles")
      .select("role")
      .eq("user_id", callingUser.id)
      .maybeSingle();
    if (!roleData || (roleData as Record<string, unknown>).role !== "super_admin") {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const callIds = Array.isArray(body?.callIds) ? body.callIds : [];
    const mode = typeof body?.mode === "string" ? body.mode : "all";
    const metricIdOverride = typeof body?.metricId === "string" ? body.metricId.trim() : "";

    const callIdsClean = callIds
      .filter((c: unknown): c is string => typeof c === "string")
      .map((c: string) => c.trim())
      .filter((c: string) => c.length > 0)
      .slice(0, 500);

    if (callIdsClean.length === 0) {
      return new Response(JSON.stringify({ error: "callIds array required and must not be empty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let metricId = metricIdOverride || null;
    if (!metricId) {
      const { data: settingRow } = await supabaseAdmin
        .from("experiment_settings")
        .select("setting_value")
        .eq("setting_key", ACTIVE_METRIC_SETTING_KEY)
        .maybeSingle();
      const activeMetricId = settingRow && (settingRow as Record<string, unknown>).setting_value;
      metricId = typeof activeMetricId === "string" && activeMetricId.trim() ? activeMetricId.trim() : null;
    }

    if (!metricId) {
      return new Response(JSON.stringify({ error: "No active metric configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const rows = callIdsClean.map((callId: string) => ({
      call_id: callId,
      metric_id: metricId,
      status: "pending",
      updated_at: now,
    }));

    // Use Supabase upsert with onConflict unique key; duplicates are naturally ignored/updated.
    const { error: upsertErr } = await supabaseAdmin
      .from("vapi_evaluation_queue")
      .upsert(rows, { onConflict: "call_id,metric_id" });

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        metricId,
        mode,
        received: callIds.length,
        enqueued: callIdsClean.length,
        message: `Enqueued ${callIdsClean.length} call(s) for evaluation.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("enqueue-vapi-evaluations error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
