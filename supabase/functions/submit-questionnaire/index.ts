import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validation schema for PETS data with positions
const petsDataSchema = z.object({
  e1: z.number().min(0).max(100),
  e2: z.number().min(0).max(100),
  e3: z.number().min(0).max(100),
  e4: z.number().min(0).max(100),
  e5: z.number().min(0).max(100),
  e6: z.number().min(0).max(100),
  u1: z.number().min(0).max(100),
  u2: z.number().min(0).max(100),
  u3: z.number().min(0).max(100),
  u4: z.number().min(0).max(100),
  e1_position: z.number().int(),
  e2_position: z.number().int(),
  e3_position: z.number().int(),
  e4_position: z.number().int(),
  e5_position: z.number().int(),
  e6_position: z.number().int(),
  u1_position: z.number().int(),
  u2_position: z.number().int(),
  u3_position: z.number().int(),
  u4_position: z.number().int(),
  attention_check_1: z.number().min(0).max(100).optional(),
  attention_check_1_expected: z.number().min(0).max(100).optional(),
  attention_check_1_position: z.number().int().optional(),
  pets_er: z.number(),
  pets_ut: z.number(),
  pets_total: z.number(),
  prolific_id: z.string().min(1).max(100),
  call_id: z.string().min(1).max(255),
});

// Validation schema for Godspeed data with positions
const godspeedDataSchema = z.object({
  godspeed_anthro_1: z.number().min(1).max(5),
  godspeed_anthro_2: z.number().min(1).max(5),
  godspeed_anthro_3: z.number().min(1).max(5),
  godspeed_anthro_4: z.number().min(1).max(5),
  godspeed_like_1: z.number().min(1).max(5),
  godspeed_like_2: z.number().min(1).max(5),
  godspeed_like_3: z.number().min(1).max(5),
  godspeed_like_4: z.number().min(1).max(5),
  godspeed_like_5: z.number().min(1).max(5),
  godspeed_intel_1: z.number().min(1).max(5),
  godspeed_intel_2: z.number().min(1).max(5),
  godspeed_intel_3: z.number().min(1).max(5),
  godspeed_intel_4: z.number().min(1).max(5),
  godspeed_intel_5: z.number().min(1).max(5),
  godspeed_anthro_1_position: z.number().int(),
  godspeed_anthro_2_position: z.number().int(),
  godspeed_anthro_3_position: z.number().int(),
  godspeed_anthro_4_position: z.number().int(),
  godspeed_like_1_position: z.number().int(),
  godspeed_like_2_position: z.number().int(),
  godspeed_like_3_position: z.number().int(),
  godspeed_like_4_position: z.number().int(),
  godspeed_like_5_position: z.number().int(),
  godspeed_intel_1_position: z.number().int(),
  godspeed_intel_2_position: z.number().int(),
  godspeed_intel_3_position: z.number().int(),
  godspeed_intel_4_position: z.number().int(),
  godspeed_intel_5_position: z.number().int(),
  godspeed_anthro_total: z.number(),
  godspeed_like_total: z.number(),
  godspeed_intel_total: z.number(),
  godspeed_attention_check_1: z.number().min(1).max(5).optional(),
  godspeed_attention_check_1_expected: z.number().min(1).max(5).optional(),
  godspeed_attention_check_1_position: z.number().int().optional(),
});

// Validation schema for TIAS data with positions
const tiasDataSchema = z.object({
  tias_1: z.number().min(1).max(7),
  tias_2: z.number().min(1).max(7),
  tias_3: z.number().min(1).max(7),
  tias_4: z.number().min(1).max(7),
  tias_5: z.number().min(1).max(7),
  tias_6: z.number().min(1).max(7),
  tias_7: z.number().min(1).max(7),
  tias_8: z.number().min(1).max(7),
  tias_9: z.number().min(1).max(7),
  tias_10: z.number().min(1).max(7),
  tias_11: z.number().min(1).max(7),
  tias_12: z.number().min(1).max(7),
  tias_1_position: z.number().int(),
  tias_2_position: z.number().int(),
  tias_3_position: z.number().int(),
  tias_4_position: z.number().int(),
  tias_5_position: z.number().int(),
  tias_6_position: z.number().int(),
  tias_7_position: z.number().int(),
  tias_8_position: z.number().int(),
  tias_9_position: z.number().int(),
  tias_10_position: z.number().int(),
  tias_11_position: z.number().int(),
  tias_12_position: z.number().int(),
  tias_total: z.number(),
  tias_attention_check_1: z.number().min(1).max(7).optional(),
  tias_attention_check_1_expected: z.number().min(1).max(7).optional(),
  tias_attention_check_1_position: z.number().int().optional(),
});

// Validation schema for TIPI data with positions
const tipiDataSchema = z.object({
  tipi_1: z.number().min(1).max(7),
  tipi_2: z.number().min(1).max(7),
  tipi_3: z.number().min(1).max(7),
  tipi_4: z.number().min(1).max(7),
  tipi_5: z.number().min(1).max(7),
  tipi_6: z.number().min(1).max(7),
  tipi_7: z.number().min(1).max(7),
  tipi_8: z.number().min(1).max(7),
  tipi_9: z.number().min(1).max(7),
  tipi_10: z.number().min(1).max(7),
  tipi_1_position: z.number().int(),
  tipi_2_position: z.number().int(),
  tipi_3_position: z.number().int(),
  tipi_4_position: z.number().int(),
  tipi_5_position: z.number().int(),
  tipi_6_position: z.number().int(),
  tipi_7_position: z.number().int(),
  tipi_8_position: z.number().int(),
  tipi_9_position: z.number().int(),
  tipi_10_position: z.number().int(),
  tipi_extraversion: z.number(),
  tipi_agreeableness: z.number(),
  tipi_conscientiousness: z.number(),
  tipi_emotional_stability: z.number(),
  tipi_openness: z.number(),
  tipi_attention_check_1: z.number().min(1).max(7).optional(),
  tipi_attention_check_1_expected: z.number().min(1).max(7).optional(),
  tipi_attention_check_1_position: z.number().int().optional(),
});

// Validation schema for intention data
const intentionDataSchema = z.object({
  intention_1: z.number().min(1).max(7),
  intention_2: z.number().min(1).max(7),
});

// Validation schema for feedback data
const feedbackDataSchema = z.object({
  formality: z.number().min(1).max(7),
  voice_assistant_feedback: z.string().min(1).max(2500),
  communication_style_feedback: z.string().min(1).max(2500),
  experiment_feedback: z.string().min(1).max(2500),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionToken, petsData, godspeedData, tiasData, tipiData, intentionData, feedbackData, assistantType } =
      await req.json();

    // Validate session token format
    if (!sessionToken || typeof sessionToken !== "string") {
      console.error("Invalid session token format");
      return new Response(JSON.stringify({ error: "Invalid session token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionToken)) {
      console.error("Session token is not a valid UUID");
      return new Response(JSON.stringify({ error: "Invalid session token format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate all data against schemas
    let validatedPets, validatedGodspeed, validatedTias, validatedTipi, validatedIntention, validatedFeedback;

    try {
      validatedPets = petsDataSchema.parse(petsData);
    } catch (err) {
      console.error("PETS validation failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid PETS data", details: err instanceof z.ZodError ? err.errors : undefined }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      validatedGodspeed = godspeedDataSchema.parse(godspeedData);
    } catch (err) {
      console.error("Godspeed validation failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid Godspeed data", details: err instanceof z.ZodError ? err.errors : undefined }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      validatedTias = tiasDataSchema.parse(tiasData);
    } catch (err) {
      console.error("TIAS validation failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid TIAS data", details: err instanceof z.ZodError ? err.errors : undefined }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      validatedTipi = tipiDataSchema.parse(tipiData);
    } catch (err) {
      console.error("TIPI validation failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid TIPI data", details: err instanceof z.ZodError ? err.errors : undefined }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      validatedIntention = intentionDataSchema.parse(intentionData);
    } catch (err) {
      console.error("Intention validation failed:", err);
      return new Response(
        JSON.stringify({
          error: "Invalid intention data",
          details: err instanceof z.ZodError ? err.errors : undefined,
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    try {
      validatedFeedback = feedbackDataSchema.parse(feedbackData);
    } catch (err) {
      console.error("Feedback validation failed:", err);
      return new Response(
        JSON.stringify({ error: "Invalid feedback data", details: err instanceof z.ZodError ? err.errors : undefined }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate session
    const { data: session, error: sessionError } = await supabase
      .from("participant_calls")
      .select("*")
      .eq("session_token", sessionToken)
      .eq("is_completed", false)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (sessionError || !session) {
      console.error("Session validation failed:", sessionError);
      return new Response(JSON.stringify({ error: "Invalid or expired session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing submission (by prolific_id since it's unique)
    const { data: existingResponse, error: existingError } = await supabase
      .from("experiment_responses")
      .select("id, prolific_id, call_id")
      .eq("prolific_id", validatedPets.prolific_id)
      .maybeSingle();

    if (existingError) {
      console.error("Error checking existing responses:", existingError);
      return new Response(JSON.stringify({ error: "Database error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isResearcherId = /^researcher[0-9]+$/i.test(validatedPets.prolific_id);
    const canReuseExistingResearcherRow =
      isResearcherId && !!existingResponse && existingResponse.call_id === validatedPets.call_id;

    if (existingResponse && !canReuseExistingResearcherRow) {
      console.log("Questionnaire already submitted for prolific_id:", validatedPets.prolific_id);
      return new Response(JSON.stringify({ error: "Questionnaire already submitted" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch current active batch from experiment_batches table
    const { data: activeBatch } = await supabase
      .from("experiment_batches")
      .select("name")
      .eq("is_active", true)
      .single();

    const batchLabel = activeBatch?.name || null;

    // Count call attempts for this participant
    const { count: callAttempts } = await supabase
      .from("participant_calls")
      .select("*", { count: "exact", head: true })
      .eq("prolific_id", validatedPets.prolific_id);

    // Insert into consolidated experiment_responses table
    const experimentData = {
      prolific_id: validatedPets.prolific_id,
      call_id: validatedPets.call_id,
      call_attempt_number: callAttempts || 1,
      // PETS items
      e1: validatedPets.e1,
      e2: validatedPets.e2,
      e3: validatedPets.e3,
      e4: validatedPets.e4,
      e5: validatedPets.e5,
      e6: validatedPets.e6,
      u1: validatedPets.u1,
      u2: validatedPets.u2,
      u3: validatedPets.u3,
      u4: validatedPets.u4,
      // PETS positions
      e1_position: validatedPets.e1_position,
      e2_position: validatedPets.e2_position,
      e3_position: validatedPets.e3_position,
      e4_position: validatedPets.e4_position,
      e5_position: validatedPets.e5_position,
      e6_position: validatedPets.e6_position,
      u1_position: validatedPets.u1_position,
      u2_position: validatedPets.u2_position,
      u3_position: validatedPets.u3_position,
      u4_position: validatedPets.u4_position,
      // PETS attention check
      attention_check_1: validatedPets.attention_check_1,
      attention_check_1_expected: validatedPets.attention_check_1_expected,
      attention_check_1_position: validatedPets.attention_check_1_position,
      // PETS scores
      pets_er: validatedPets.pets_er,
      pets_ut: validatedPets.pets_ut,
      pets_total: validatedPets.pets_total,
      // Godspeed Anthropomorphism items
      godspeed_anthro_1: validatedGodspeed.godspeed_anthro_1,
      godspeed_anthro_2: validatedGodspeed.godspeed_anthro_2,
      godspeed_anthro_3: validatedGodspeed.godspeed_anthro_3,
      godspeed_anthro_4: validatedGodspeed.godspeed_anthro_4,
      godspeed_anthro_1_position: validatedGodspeed.godspeed_anthro_1_position,
      godspeed_anthro_2_position: validatedGodspeed.godspeed_anthro_2_position,
      godspeed_anthro_3_position: validatedGodspeed.godspeed_anthro_3_position,
      godspeed_anthro_4_position: validatedGodspeed.godspeed_anthro_4_position,
      godspeed_anthro_total: validatedGodspeed.godspeed_anthro_total,
      // Godspeed Likeability items
      godspeed_like_1: validatedGodspeed.godspeed_like_1,
      godspeed_like_2: validatedGodspeed.godspeed_like_2,
      godspeed_like_3: validatedGodspeed.godspeed_like_3,
      godspeed_like_4: validatedGodspeed.godspeed_like_4,
      godspeed_like_5: validatedGodspeed.godspeed_like_5,
      godspeed_like_1_position: validatedGodspeed.godspeed_like_1_position,
      godspeed_like_2_position: validatedGodspeed.godspeed_like_2_position,
      godspeed_like_3_position: validatedGodspeed.godspeed_like_3_position,
      godspeed_like_4_position: validatedGodspeed.godspeed_like_4_position,
      godspeed_like_5_position: validatedGodspeed.godspeed_like_5_position,
      godspeed_like_total: validatedGodspeed.godspeed_like_total,
      // Godspeed Intelligence items
      godspeed_intel_1: validatedGodspeed.godspeed_intel_1,
      godspeed_intel_2: validatedGodspeed.godspeed_intel_2,
      godspeed_intel_3: validatedGodspeed.godspeed_intel_3,
      godspeed_intel_4: validatedGodspeed.godspeed_intel_4,
      godspeed_intel_5: validatedGodspeed.godspeed_intel_5,
      godspeed_intel_1_position: validatedGodspeed.godspeed_intel_1_position,
      godspeed_intel_2_position: validatedGodspeed.godspeed_intel_2_position,
      godspeed_intel_3_position: validatedGodspeed.godspeed_intel_3_position,
      godspeed_intel_4_position: validatedGodspeed.godspeed_intel_4_position,
      godspeed_intel_5_position: validatedGodspeed.godspeed_intel_5_position,
      godspeed_intel_total: validatedGodspeed.godspeed_intel_total,
      // Godspeed attention check
      godspeed_attention_check_1: validatedGodspeed.godspeed_attention_check_1,
      godspeed_attention_check_1_expected: validatedGodspeed.godspeed_attention_check_1_expected,
      godspeed_attention_check_1_position: validatedGodspeed.godspeed_attention_check_1_position,
      // TIAS items
      tias_1: validatedTias.tias_1,
      tias_2: validatedTias.tias_2,
      tias_3: validatedTias.tias_3,
      tias_4: validatedTias.tias_4,
      tias_5: validatedTias.tias_5,
      tias_6: validatedTias.tias_6,
      tias_7: validatedTias.tias_7,
      tias_8: validatedTias.tias_8,
      tias_9: validatedTias.tias_9,
      tias_10: validatedTias.tias_10,
      tias_11: validatedTias.tias_11,
      tias_12: validatedTias.tias_12,
      // TIAS positions
      tias_1_position: validatedTias.tias_1_position,
      tias_2_position: validatedTias.tias_2_position,
      tias_3_position: validatedTias.tias_3_position,
      tias_4_position: validatedTias.tias_4_position,
      tias_5_position: validatedTias.tias_5_position,
      tias_6_position: validatedTias.tias_6_position,
      tias_7_position: validatedTias.tias_7_position,
      tias_8_position: validatedTias.tias_8_position,
      tias_9_position: validatedTias.tias_9_position,
      tias_10_position: validatedTias.tias_10_position,
      tias_11_position: validatedTias.tias_11_position,
      tias_12_position: validatedTias.tias_12_position,
      // TIAS attention check
      tias_attention_check_1: validatedTias.tias_attention_check_1,
      tias_attention_check_1_expected: validatedTias.tias_attention_check_1_expected,
      tias_attention_check_1_position: validatedTias.tias_attention_check_1_position,
      // TIAS score
      tias_total: validatedTias.tias_total,
      // TIPI items
      tipi_1: validatedTipi.tipi_1,
      tipi_2: validatedTipi.tipi_2,
      tipi_3: validatedTipi.tipi_3,
      tipi_4: validatedTipi.tipi_4,
      tipi_5: validatedTipi.tipi_5,
      tipi_6: validatedTipi.tipi_6,
      tipi_7: validatedTipi.tipi_7,
      tipi_8: validatedTipi.tipi_8,
      tipi_9: validatedTipi.tipi_9,
      tipi_10: validatedTipi.tipi_10,
      // TIPI positions
      tipi_1_position: validatedTipi.tipi_1_position,
      tipi_2_position: validatedTipi.tipi_2_position,
      tipi_3_position: validatedTipi.tipi_3_position,
      tipi_4_position: validatedTipi.tipi_4_position,
      tipi_5_position: validatedTipi.tipi_5_position,
      tipi_6_position: validatedTipi.tipi_6_position,
      tipi_7_position: validatedTipi.tipi_7_position,
      tipi_8_position: validatedTipi.tipi_8_position,
      tipi_9_position: validatedTipi.tipi_9_position,
      tipi_10_position: validatedTipi.tipi_10_position,
      // TIPI attention check
      tipi_attention_check_1: validatedTipi.tipi_attention_check_1,
      tipi_attention_check_1_expected: validatedTipi.tipi_attention_check_1_expected,
      tipi_attention_check_1_position: validatedTipi.tipi_attention_check_1_position,
      // TIPI Big Five scores
      tipi_extraversion: validatedTipi.tipi_extraversion,
      tipi_agreeableness: validatedTipi.tipi_agreeableness,
      tipi_conscientiousness: validatedTipi.tipi_conscientiousness,
      tipi_emotional_stability: validatedTipi.tipi_emotional_stability,
      tipi_openness: validatedTipi.tipi_openness,
      // Intention
      intention_1: validatedIntention.intention_1,
      intention_2: validatedIntention.intention_2,
      // Formality and feedback
      formality: validatedFeedback.formality,
      voice_assistant_feedback: validatedFeedback.voice_assistant_feedback,
      communication_style_feedback: validatedFeedback.communication_style_feedback,
      experiment_feedback: validatedFeedback.experiment_feedback,
      // Assistant type (formal/informal)
      assistant_type: assistantType || null,
      // Batch label
      batch_label: batchLabel || null,
    };

    if (canReuseExistingResearcherRow && existingResponse) {
      const { error: updateDraftError } = await supabase
        .from("experiment_responses")
        .update(experimentData)
        .eq("id", existingResponse.id);

      if (updateDraftError) {
        console.error("Failed to update existing researcher response:", updateDraftError);
        return new Response(JSON.stringify({ error: "Failed to save questionnaire" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { error: insertError } = await supabase.from("experiment_responses").insert([experimentData]);

      if (insertError) {
        console.error("Failed to insert experiment response:", insertError);
        return new Response(JSON.stringify({ error: "Failed to save questionnaire" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Mark session token as used
    const { error: updateError } = await supabase
      .from("participant_calls")
      .update({ is_completed: true })
      .eq("session_token", sessionToken);

    if (updateError) {
      console.error("Failed to mark token as used:", updateError);
    }

    console.log("Experiment response submitted successfully for prolific_id:", validatedPets.prolific_id);

    return new Response(JSON.stringify({ success: true, message: "Questionnaire submitted successfully" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error in submit-questionnaire:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
