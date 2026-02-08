import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateResearcherSessionRequest {
  source?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Optional request body for future metadata extensions.
    try {
      (await req.json()) as CreateResearcherSessionRequest;
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

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: prolificId, error: idError } = await supabase.rpc("next_researcher_prolific_id");
    if (idError || !prolificId || typeof prolificId !== "string") {
      console.error("Failed to allocate researcher ID:", idError);
      return new Response(JSON.stringify({ error: "Failed to allocate researcher ID" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      console.error("Failed to create participant_calls row:", callInsertError);
      return new Response(JSON.stringify({ error: "Failed to create researcher session" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    console.error("create-researcher-session error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
