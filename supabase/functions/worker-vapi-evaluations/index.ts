import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIVE_METRIC_SETTING_KEY = "active_vapi_evaluation_metric_id";

const RUN_START_LIMIT = 25;
const MAX_CALL_IDS_PER_VAPI_RUN = 50;
const POLL_MIN_AGE_SEC = 60;
const POLL_CALL_BUDGET = 100;
const MAX_POLL_ATTEMPTS = 10;

type PlainObj = Record<string, unknown>;

const isPlainObject = (v: unknown): v is PlainObj => typeof v === "object" && v !== null && !Array.isArray(v);

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const nowIso = () => new Date().toISOString();

// Use `any` for Supabase client in Edge Functions to avoid overly-strict generic inference in Deno check.
// The runtime contract is the Supabase HTTP API; compile-time types here are not worth the friction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isSuperAdmin = async (supabaseAdmin: any, userId: string): Promise<boolean> => {
  const { data } = await supabaseAdmin.from("researcher_roles").select("role").eq("user_id", userId).maybeSingle();
  return Boolean(data && (data as PlainObj).role === "super_admin");
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getActiveMetricId = async (supabaseAdmin: any): Promise<string | null> => {
  const { data } = await supabaseAdmin
    .from("experiment_settings")
    .select("setting_value")
    .eq("setting_key", ACTIVE_METRIC_SETTING_KEY)
    .maybeSingle();
  const v = data && (data as PlainObj).setting_value;
  const s = typeof v === "string" ? v : "";
  return s.trim() ? s.trim() : null;
};

const getStructuredOutputIdForMetric = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  metricId: string
): Promise<string | null> => {
  const { data } = await supabaseAdmin
    .from("vapi_evaluation_metrics")
    .select("structured_output_id")
    .eq("id", metricId)
    .maybeSingle();
  const v = data && (data as PlainObj).structured_output_id;
  const s = typeof v === "string" ? v : "";
  return s.trim() ? s.trim() : null;
};

const fetchJson = async (url: string, init: RequestInit) => {
  const res = await fetch(url, init);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // ignore
  }
  return { ok: res.ok, status: res.status, text, json };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const vapiKey = Deno.env.get("VAPI_PRIVATE_KEY") ?? "";
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Supabase env not configured");
    if (!vapiKey) throw new Error("VAPI_PRIVATE_KEY not configured");

    // Auth: allow super admin JWT OR x-worker-secret.
    const workerSecret = Deno.env.get("WORKER_SECRET") ?? "";
    const headerSecret = req.headers.get("x-worker-secret") ?? "";
    const hasWorkerSecret = workerSecret && headerSecret && workerSecret === headerSecret;

    const authHeader = req.headers.get("Authorization");
    if (!hasWorkerSecret && !authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    if (!hasWorkerSecret && authHeader) {
      const supabaseUser = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await supabaseUser.auth.getUser();
      if (error || !data?.user) {
        return new Response(JSON.stringify({ error: "Invalid user session" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!(await isSuperAdmin(supabaseAdmin, data.user.id))) {
        return new Response(JSON.stringify({ error: "Not authorized" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const metricIdOverride = typeof body?.metricId === "string" ? body.metricId.trim() : "";
    const metricId = metricIdOverride || (await getActiveMetricId(supabaseAdmin));
    if (!metricId) {
      return new Response(JSON.stringify({ error: "No active metric configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const structuredOutputId = await getStructuredOutputIdForMetric(supabaseAdmin, metricId);
    if (!structuredOutputId) {
      return new Response(JSON.stringify({ error: "Metric not found or missing structured_output_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = nowIso();

    // 1) Start runs for pending queue items (this is best-effort "claim"; no FOR UPDATE SKIP LOCKED in Supabase client).
    const { data: pendingRows, error: pendingErr } = await supabaseAdmin
      .from("vapi_evaluation_queue")
      .select("id, call_id, metric_id, status")
      .eq("metric_id", metricId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(RUN_START_LIMIT);
    if (pendingErr) throw new Error(pendingErr.message);

    let startedRuns = 0;
    let startedCalls = 0;
    const pendingCallIds = (pendingRows ?? [])
      .map((r) => (r as PlainObj).call_id)
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    for (const group of chunk(pendingCallIds, MAX_CALL_IDS_PER_VAPI_RUN)) {
      if (group.length === 0) continue;

      // Start Vapi run
      const vapi = await fetchJson("https://api.vapi.ai/structured-output/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${vapiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ structuredOutputId, callIds: group }),
      });
      if (!vapi.ok) {
        // Mark queue items failed for this group (best-effort).
        await supabaseAdmin
          .from("vapi_evaluation_queue")
          .update({ status: "failed", attempts: 1, last_error: `vapi_run_${vapi.status}`, updated_at: now })
          .in("call_id", group)
          .eq("metric_id", metricId);
        continue;
      }
      const workflowId = isPlainObject(vapi.json) ? (vapi.json as PlainObj).workflowId : null;
      if (typeof workflowId !== "string" || !workflowId.trim()) continue;

      const { data: insertedRun } = await supabaseAdmin
        .from("vapi_structured_output_runs")
        .insert({
          workflow_id: workflowId,
          call_ids: group,
          metric_id: metricId,
          status: "pending",
          updated_at: now,
        })
        .select("id")
        .single();

      const runId = insertedRun && (insertedRun as PlainObj).id;
      if (typeof runId !== "string" || !runId.trim()) continue;

      await supabaseAdmin
        .from("vapi_evaluation_queue")
        .update({ status: "running", run_id: runId, updated_at: now })
        .in("call_id", group)
        .eq("metric_id", metricId);

      startedRuns += 1;
      startedCalls += group.length;
    }

    // 2) Poll existing runs (pending/partial) with backoff + call budget.
    const pollCutoff = new Date(Date.now() - POLL_MIN_AGE_SEC * 1000).toISOString();
    const { data: runRows, error: runErr } = await supabaseAdmin
      .from("vapi_structured_output_runs")
      .select("id, call_ids, status, poll_attempts, last_polled_at, metric_id")
      .eq("metric_id", metricId)
      .in("status", ["pending", "partial"])
      .or(`last_polled_at.is.null,last_polled_at.lte.${pollCutoff}`)
      .order("updated_at", { ascending: true })
      .limit(10);
    if (runErr) throw new Error(runErr.message);

    let polledRuns = 0;
    let polledCalls = 0;
    let updatedEvaluation = 0;
    let updatedStructuredOutputs = 0;

    for (const r of runRows ?? []) {
      const runId = (r as PlainObj).id;
      const callIds = (r as PlainObj).call_ids;
      const attempts = Number((r as PlainObj).poll_attempts ?? 0);
      if (typeof runId !== "string" || !Array.isArray(callIds)) continue;
      if (attempts >= MAX_POLL_ATTEMPTS) {
        await supabaseAdmin
          .from("vapi_structured_output_runs")
          .update({ status: "failed", last_error: "max_poll_attempts", updated_at: now })
          .eq("id", runId);
        await supabaseAdmin
          .from("vapi_evaluation_queue")
          .update({ status: "failed", last_error: "max_poll_attempts", updated_at: now })
          .eq("run_id", runId);
        continue;
      }

      const remainingBudget = POLL_CALL_BUDGET - polledCalls;
      if (remainingBudget <= 0) break;
      const callIdsLimited = (callIds as unknown[])
        .filter((c): c is string => typeof c === "string")
        .slice(0, remainingBudget);
      if (callIdsLimited.length === 0) continue;

      // Reuse the persistence logic via internal invoke of fetch-vapi-structured-output-results.
      const url = `${supabaseUrl}/functions/v1/fetch-vapi-structured-output-results`;
      const resp = await fetchJson(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ runId, callIds: callIdsLimited }),
      });

      polledRuns += 1;
      polledCalls += callIdsLimited.length;

      if (resp.ok && isPlainObject(resp.json)) {
        updatedEvaluation += Number((resp.json as PlainObj).updatedEvaluation ?? 0);
        updatedStructuredOutputs += Number((resp.json as PlainObj).updatedStructuredOutputs ?? 0);
      }

      const newAttempts = attempts + 1;
      await supabaseAdmin
        .from("vapi_structured_output_runs")
        .update({ poll_attempts: newAttempts, last_polled_at: now, updated_at: now })
        .eq("id", runId);

      // If the run is now completed, mark queue items complete.
      const { data: statusRow } = await supabaseAdmin
        .from("vapi_structured_output_runs")
        .select("status")
        .eq("id", runId)
        .maybeSingle();
      const st = statusRow && (statusRow as PlainObj).status;
      if (st === "completed") {
        await supabaseAdmin
          .from("vapi_evaluation_queue")
          .update({ status: "completed", updated_at: now })
          .eq("run_id", runId);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        metricId,
        structuredOutputId,
        startedRuns,
        startedCalls,
        polledRuns,
        polledCalls,
        updatedEvaluation,
        updatedStructuredOutputs,
        message: `Started ${startedRuns} run(s) (${startedCalls} calls). Polled ${polledRuns} run(s) (${polledCalls} calls).`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("worker-vapi-evaluations error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
