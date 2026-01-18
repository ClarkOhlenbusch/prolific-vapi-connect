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

// Check if Prolific ID is a real participant (24 characters)
const isRealParticipant = (prolificId: string | null): boolean => {
  return prolificId !== null && prolificId.length === 24;
};

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

    console.log(`[get-experiment-config] Prolific ID: ${prolificId}, Length: ${prolificId?.length || 0}, Is real: ${isRealParticipant(prolificId)}`);

    // Fetch all relevant settings
    const { data, error } = await supabase
      .from("experiment_settings")
      .select("setting_key, setting_value")
      .in("setting_key", [
        "active_assistant_type",
        "current_batch_label",
        "alternating_mode_enabled",
        "real_participant_count",
        "formal_participant_count",
        "informal_participant_count",
        "condition_offset_count",
        "condition_offset_type"
      ]);

    if (error) {
      console.error("Error fetching experiment config:", error);
      // Default to informal if setting not found
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

    // Parse settings into an object
    const settings: Record<string, string> = {};
    data?.forEach(s => {
      settings[s.setting_key] = s.setting_value;
    });

    const alternatingEnabled = settings.alternating_mode_enabled === "true";
    const staticType = (settings.active_assistant_type || "informal") as keyof typeof ASSISTANT_IDS;
    const batchLabel = settings.current_batch_label || null;
    const offsetCount = parseInt(settings.condition_offset_count || "0", 10);
    const offsetType = (settings.condition_offset_type || "informal") as keyof typeof ASSISTANT_IDS;
    const formalCount = parseInt(settings.formal_participant_count || "0", 10);
    const informalCount = parseInt(settings.informal_participant_count || "0", 10);

    let assistantType: keyof typeof ASSISTANT_IDS;
    let shouldIncrementCounter = false;
    let shouldDecrementOffset = false;
    let assignedCondition: keyof typeof ASSISTANT_IDS | null = null;

    if (!alternatingEnabled) {
      // Static mode: use the configured assistant type
      assistantType = staticType;
      console.log(`[get-experiment-config] Static mode - using: ${assistantType}`);
    } else {
      // Alternating mode
      if (!isRealParticipant(prolificId)) {
        // Not a real participant (tester/researcher) - use static type, don't count
        assistantType = staticType;
        console.log(`[get-experiment-config] Alternating mode - TESTER detected (ID length: ${prolificId?.length || 0}) - using static: ${assistantType}`);
      } else {
        // Real participant - apply alternating logic
        if (offsetCount > 0) {
          // Offset active - use offset condition
          assistantType = offsetType;
          shouldDecrementOffset = true;
          assignedCondition = offsetType;
          console.log(`[get-experiment-config] Alternating mode - OFFSET active (${offsetCount} remaining) - assigning: ${assistantType}`);
        } else {
          // Normal alternating - assign based on which has fewer
          // If equal, assign formal first
          if (formalCount <= informalCount) {
            assistantType = "formal";
          } else {
            assistantType = "informal";
          }
          assignedCondition = assistantType;
          shouldIncrementCounter = true;
          console.log(`[get-experiment-config] Alternating mode - Formal: ${formalCount}, Informal: ${informalCount} - assigning: ${assistantType}`);
        }
      }
    }

    // Update counters if needed
    if (shouldIncrementCounter && assignedCondition) {
      const countKey = assignedCondition === "formal" ? "formal_participant_count" : "informal_participant_count";
      const newCount = assignedCondition === "formal" ? formalCount + 1 : informalCount + 1;
      
      const { error: updateError } = await supabase
        .from("experiment_settings")
        .update({ 
          setting_value: String(newCount),
          updated_at: new Date().toISOString()
        })
        .eq("setting_key", countKey);

      if (updateError) {
        console.error(`Error updating ${countKey}:`, updateError);
      } else {
        console.log(`[get-experiment-config] Incremented ${countKey} to ${newCount}`);
      }
    }

    if (shouldDecrementOffset) {
      const newOffset = Math.max(0, offsetCount - 1);
      
      // Decrement offset
      const { error: offsetError } = await supabase
        .from("experiment_settings")
        .update({ 
          setting_value: String(newOffset),
          updated_at: new Date().toISOString()
        })
        .eq("setting_key", "condition_offset_count");

      if (offsetError) {
        console.error("Error decrementing offset:", offsetError);
      } else {
        console.log(`[get-experiment-config] Decremented offset to ${newOffset}`);
      }

      // Also increment the condition counter for the offset type
      const countKey = offsetType === "formal" ? "formal_participant_count" : "informal_participant_count";
      const currentCount = offsetType === "formal" ? formalCount : informalCount;
      
      const { error: countError } = await supabase
        .from("experiment_settings")
        .update({ 
          setting_value: String(currentCount + 1),
          updated_at: new Date().toISOString()
        })
        .eq("setting_key", countKey);

      if (countError) {
        console.error(`Error updating ${countKey} for offset:`, countError);
      } else {
        console.log(`[get-experiment-config] Incremented ${countKey} to ${currentCount + 1} (offset assignment)`);
      }
    }

    const assistantId = ASSISTANT_IDS[assistantType] || ASSISTANT_IDS.informal;
    const practiceAssistantId = PRACTICE_ASSISTANT_IDS[assistantType] || PRACTICE_ASSISTANT_IDS.informal;

    return new Response(
      JSON.stringify({
        assistantType,
        assistantId,
        practiceAssistantId,
        batchLabel: batchLabel && batchLabel.trim() !== "" ? batchLabel : null,
        // Include stats for transparency
        stats: {
          alternatingEnabled,
          formalCount: shouldIncrementCounter && assignedCondition === "formal" ? formalCount + 1 : formalCount,
          informalCount: shouldIncrementCounter && assignedCondition === "informal" ? informalCount + 1 : informalCount,
          offsetRemaining: shouldDecrementOffset ? Math.max(0, offsetCount - 1) : offsetCount,
          isRealParticipant: isRealParticipant(prolificId),
        }
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
