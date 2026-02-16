import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
//test
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateResearcherSessionRequest {
  source?: string;
  existingSessionToken?: string;
}

const isUuid = (value: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
};

const formatDbError = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return { raw: String(error) };
  }

  const dbError = error as { code?: string; message?: string; details?: string; hint?: string };
  return {
    code: dbError.code ?? null,
    message: dbError.message ?? null,
    details: dbError.details ?? null,
    hint: dbError.hint ?? null,
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const requestStart = Date.now();

    // Optional request body for future metadata extensions.
    let requestBody: CreateResearcherSessionRequest | null = null;
    try {
      requestBody = (await req.json()) as CreateResearcherSessionRequest;
    } catch {
      // No-op.
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseHost = new URL(supabaseUrl).host;
    console.log("create-researcher-session request started", {
      requestId,
      method: req.method,
      source: requestBody?.source ?? null,
      supabaseHost,
    });

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (requestBody?.existingSessionToken) {
      const candidateToken = requestBody.existingSessionToken.trim();
      if (isUuid(candidateToken)) {
        const { data: existingSession, error: existingLookupError } = await supabase
          .from("participant_calls")
          .select("prolific_id, call_id, expires_at")
          .eq("session_token", candidateToken)
          .eq("is_completed", false)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (existingLookupError) {
          const formattedExistingLookupError = formatDbError(existingLookupError);
          console.error("Failed to check existing researcher session", {
            requestId,
            existingSessionToken: candidateToken,
            error: formattedExistingLookupError,
          });
          return new Response(
            JSON.stringify({
              error: "Failed to check existing researcher session",
              requestId,
              dbError: formattedExistingLookupError,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (existingSession) {
          console.log("Reusing existing researcher session", {
            requestId,
            prolificId: existingSession.prolific_id,
            callId: existingSession.call_id,
          });
          return new Response(
            JSON.stringify({
              prolificId: existingSession.prolific_id,
              callId: existingSession.call_id,
              sessionToken: candidateToken,
              expiresAt: existingSession.expires_at,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      if (!isUuid(candidateToken)) {
        console.log("Ignoring invalid existingSessionToken", {
          requestId,
          existingSessionToken: requestBody.existingSessionToken,
        });
      }
    }

    const { data: prolificId, error: idError } = await supabase.rpc("next_researcher_prolific_id");
    if (idError || !prolificId || typeof prolificId !== "string") {
      const formattedIdError = formatDbError(idError);
      console.error("Failed to allocate researcher ID", { requestId, error: formattedIdError });
      return new Response(
        JSON.stringify({
          error: "Failed to allocate researcher ID",
          requestId,
          dbError: formattedIdError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const sessionToken = crypto.randomUUID();
    const callId = `researcher-call-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: callInsertError } = await supabase.from("participant_calls").insert({
      prolific_id: prolificId,
      call_id: callId,
      session_token: sessionToken,
      expires_at: expiresAt,
      is_completed: false,
    });

    if (callInsertError) {
      const formattedInsertError = formatDbError(callInsertError);
      console.error("Failed to create participant_calls row", {
        requestId,
        prolificId,
        callId,
        insertPayloadShape: ["prolific_id", "call_id", "session_token", "expires_at", "is_completed"],
        error: formattedInsertError,
      });
      return new Response(
        JSON.stringify({
          error: "Failed to create researcher session",
          requestId,
          dbError: formattedInsertError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error: draftInsertError } = await supabase.from("experiment_responses").insert({
      prolific_id: prolificId,
      call_id: callId,
      session_token: sessionToken,
      submission_status: "pending",
      last_step: "researcher_session_created",
      last_saved_at: new Date().toISOString(),
    });

    if (draftInsertError) {
      const formattedDraftInsertError = formatDbError(draftInsertError);
      console.error("Failed to create experiment_responses draft row", {
        requestId,
        prolificId,
        callId,
        error: formattedDraftInsertError,
      });
      return new Response(
        JSON.stringify({
          error: "Failed to create researcher session draft",
          requestId,
          dbError: formattedDraftInsertError,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("create-researcher-session request succeeded", {
      requestId,
      prolificId,
      callId,
      durationMs: Date.now() - requestStart,
    });

    return new Response(
      JSON.stringify({
        prolificId,
        callId,
        sessionToken,
        expiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const formattedUnexpected = formatDbError(error);
    console.error("create-researcher-session unexpected error", {
      error: formattedUnexpected,
    });
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        dbError: formattedUnexpected,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
