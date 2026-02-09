const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      canary: "LOVABLE_DEPLOY_TEST_2026",
      message: "If you see this, the new edge function code is live.",
      ts: Date.now(),
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

//hello
