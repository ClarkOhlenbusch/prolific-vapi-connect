import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  sessionToken: z.string().uuid(),
  prolificId: z.string().trim().min(1).max(100).optional(),
  callId: z.string().trim().max(255).optional(),
  lastStep: z.string().trim().max(120).optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid draft payload", details: parsed.error.errors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { sessionToken, prolificId, callId, lastStep } = parsed.data;
    const now = new Date().toISOString();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: session, error: sessionError } = await supabase
      .from("participant_calls")
      .select("prolific_id, call_id")
      .eq("session_token", sessionToken)
      .maybeSingle();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Invalid session token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const effectiveProlificId = prolificId || session.prolific_id;
    const effectiveCallId = callId ?? session.call_id ?? "";

    const { data: existingRows, error: existingError } = await supabase
      .from("experiment_responses")
      .select("id")
      .eq("session_token", sessionToken)
      .limit(1);

    if (existingError) {
      return new Response(JSON.stringify({ error: "Failed to read existing draft" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const existingRow = existingRows?.[0] ?? null;

    if (existingRow) {
      const updatePayload: Record<string, unknown> = {
        last_saved_at: now,
      };

      if (lastStep) {
        updatePayload.last_step = lastStep;
      }
      if (callId && callId.trim()) {
        updatePayload.call_id = callId.trim();
      }
      if (prolificId && prolificId.trim()) {
        updatePayload.prolific_id = prolificId.trim();
      }

      const { error: updateError } = await supabase
        .from("experiment_responses")
        .update(updatePayload)
        .eq("id", existingRow.id);

      if (updateError) {
        return new Response(JSON.stringify({ error: "Failed to update draft row" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, mode: "updated" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insertPayload = {
      session_token: sessionToken,
      prolific_id: effectiveProlificId,
      call_id: effectiveCallId,
      submission_status: "pending",
      last_step: lastStep || "session_started",
      last_saved_at: now,
    };

    const { error: insertError } = await supabase.from("experiment_responses").insert([insertPayload]);
    if (insertError) {
      return new Response(JSON.stringify({ error: "Failed to create draft row" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, mode: "inserted" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
