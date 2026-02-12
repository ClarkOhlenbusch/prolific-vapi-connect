import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    let updated = 0;

    for (const callId of callIds) {
      const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) continue;
      const call = await res.json();
      const structuredData = call?.analysis?.structuredData;
      if (!structuredData || structuredData.total_score === undefined) continue;

      const { error: updateErr } = await supabaseAdmin
        .from("experiment_responses")
        .update({
          vapi_structured_output: structuredData,
          vapi_structured_output_at: now,
        })
        .eq("call_id", callId);

      if (!updateErr) updated += 1;
    }

    const runId = body?.runId;
    if (runId && callIds.length > 0) {
      const status = updated === callIds.length ? "completed" : updated > 0 ? "partial" : "pending";
      await supabaseAdmin
        .from("vapi_structured_output_runs")
        .update({ status, updated_at: now })
        .eq("id", runId);
    }

    return new Response(
      JSON.stringify({
        updated,
        total: callIds.length,
        message: updated === callIds.length
          ? `All ${callIds.length} calls updated.`
          : `Updated ${updated} of ${callIds.length} calls. Others may still be processing.`,
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
