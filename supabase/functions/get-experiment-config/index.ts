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

    // Fetch both settings at once
    const { data, error } = await supabase
      .from("experiment_settings")
      .select("setting_key, setting_value")
      .in("setting_key", ["active_assistant_type", "current_batch_label"]);

    if (error) {
      console.error("Error fetching experiment config:", error);
      // Default to informal if setting not found
      return new Response(
        JSON.stringify({
          assistantType: "informal",
          assistantId: ASSISTANT_IDS.informal,
          batchLabel: null,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const assistantSetting = data?.find(s => s.setting_key === "active_assistant_type");
    const batchSetting = data?.find(s => s.setting_key === "current_batch_label");

    const assistantType = (assistantSetting?.setting_value as keyof typeof ASSISTANT_IDS) || "informal";
    const assistantId = ASSISTANT_IDS[assistantType] || ASSISTANT_IDS.informal;
    const batchLabel = batchSetting?.setting_value || null;

    return new Response(
      JSON.stringify({
        assistantType,
        assistantId,
        batchLabel: batchLabel && batchLabel.trim() !== "" ? batchLabel : null,
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
