import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Assistant ID mappings
const ASSISTANT_IDS = {
  formal: "77569740-f001-4419-92f8-78a6ed2dde70",
  informal: "f391bf0c-f1d2-4473-bdf8-e88343224d68",
} as const;

// Practice/warm-up assistant ID mappings
const PRACTICE_ASSISTANT_IDS = {
  formal: "ea2a5f95-5c07-4498-996b-5b3e204192f8",
  informal: "30394944-4d48-4586-8e6d-cd3d6b347e80",
} as const;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for prolificId
    let prolificId: string | null = null;
    try {
      const body = await req.json();
      prolificId = body.prolificId || null;
    } catch {
      // No body or invalid JSON, prolificId stays null
    }

    const isRealParticipant = prolificId !== null && prolificId.length === 24;
    console.log(`[get-experiment-config] Prolific ID: ${prolificId}, Length: ${prolificId?.length || 0}, Is real: ${isRealParticipant}`);

    // Fetch batch label separately (not part of atomic function)
    const { data: batchData } = await supabase
      .from("experiment_settings")
      .select("setting_value")
      .eq("setting_key", "current_batch_label")
      .maybeSingle();

    const batchLabel = batchData?.setting_value || null;

    // Use the atomic function for condition assignment
    const { data: result, error: rpcError } = await supabase.rpc(
      "get_next_condition_assignment",
      { p_prolific_id: prolificId }
    );

    if (rpcError) {
      console.error("Error calling get_next_condition_assignment:", rpcError);
      // Fallback to informal
      return new Response(
        JSON.stringify({
          assistantType: "informal",
          assistantId: ASSISTANT_IDS.informal,
          practiceAssistantId: PRACTICE_ASSISTANT_IDS.informal,
          batchLabel: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const assignedCondition = result.assigned_condition as keyof typeof ASSISTANT_IDS;
    const assistantId = ASSISTANT_IDS[assignedCondition] || ASSISTANT_IDS.informal;
    const practiceAssistantId = PRACTICE_ASSISTANT_IDS[assignedCondition] || PRACTICE_ASSISTANT_IDS.informal;

    console.log(`[get-experiment-config] Atomic assignment result:`, result);

    return new Response(
      JSON.stringify({
        assistantType: assignedCondition,
        assistantId,
        practiceAssistantId,
        batchLabel: batchLabel && batchLabel.trim() !== "" ? batchLabel : null,
        stats: {
          alternatingEnabled: true, // If we got here via atomic function
          formalCount: result.formal_count,
          informalCount: result.informal_count,
          offsetRemaining: result.offset_remaining,
          isRealParticipant: result.is_real_participant,
          usedOffset: result.used_offset,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
