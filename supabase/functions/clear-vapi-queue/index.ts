/**
 * clear-vapi-queue
 * ────────────────
 * Deletes pending/running rows from the vapi_evaluation_queue table using
 * the service role key (bypasses RLS which has no DELETE policy for users).
 *
 * Super admin only. Optionally scoped to a specific metric_id.
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: roleData } = await supabaseAdmin
    .from("researcher_roles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!roleData || (roleData as PlainObj).role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden: super admin required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body: PlainObj = await req.json().catch(() => ({}));
  // Optional: scope to a specific metric_id; if omitted, clears all pending/running
  const metricId: string | null = typeof body.metricId === "string" && body.metricId.trim() ? body.metricId.trim() : null;

  let query = supabaseAdmin
    .from("vapi_evaluation_queue")
    .delete()
    .in("status", ["pending", "running"]);

  if (metricId) {
    query = query.eq("metric_id", metricId);
  }

  const { error: deleteError, count } = await query;

  if (deleteError) {
    console.error("[clear-vapi-queue] Delete error:", deleteError.message);
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.info(`[clear-vapi-queue] Cleared queue${metricId ? ` for metric ${metricId}` : ''}`);

  return new Response(
    JSON.stringify({ ok: true, message: "Queue cleared." }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});