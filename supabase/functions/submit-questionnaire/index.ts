import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation schema matching the client-side schema
const petsResponseSchema = z.object({
  // PETS items (0-100 scale)
  e1: z.number().min(0).max(100).int(),
  e2: z.number().min(0).max(100).int(),
  e3: z.number().min(0).max(100).int(),
  e4: z.number().min(0).max(100).int(),
  e5: z.number().min(0).max(100).int(),
  e6: z.number().min(0).max(100).int(),
  u1: z.number().min(0).max(100).int(),
  u2: z.number().min(0).max(100).int(),
  u3: z.number().min(0).max(100).int(),
  u4: z.number().min(0).max(100).int(),
  pets_er: z.number(),
  pets_ut: z.number(),
  pets_total: z.number(),
  attention_check_1: z.number().min(0).max(100).int().optional(),
  attention_check_2: z.number().min(0).max(100).int().optional(),
  attention_check_3: z.number().min(0).max(100).int().optional(),
  attention_check_1_expected: z.number().min(0).max(100).int().optional(),
  attention_check_2_expected: z.number().min(0).max(100).int().optional(),
  attention_check_3_expected: z.number().min(0).max(100).int().optional(),
  // TIAS items (1-7 scale)
  tias_1: z.number().min(1).max(7).int(),
  tias_2: z.number().min(1).max(7).int(),
  tias_3: z.number().min(1).max(7).int(),
  tias_4: z.number().min(1).max(7).int(),
  tias_5: z.number().min(1).max(7).int(),
  tias_6: z.number().min(1).max(7).int(),
  tias_7: z.number().min(1).max(7).int(),
  tias_8: z.number().min(1).max(7).int(),
  tias_9: z.number().min(1).max(7).int(),
  tias_10: z.number().min(1).max(7).int(),
  tias_11: z.number().min(1).max(7).int(),
  tias_12: z.number().min(1).max(7).int(),
  tias_total: z.number(),
  // IDs
  prolific_id: z.string().min(1).max(100),
  call_id: z.string().min(1).max(100),
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionToken, questionnaireData } = await req.json();

    // Validate inputs
    if (!sessionToken || typeof sessionToken !== 'string') {
      console.error('Invalid session token format');
      return new Response(
        JSON.stringify({ error: 'Invalid session token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format for session token
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionToken)) {
      console.error('Session token is not a valid UUID');
      return new Response(
        JSON.stringify({ error: 'Invalid session token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate questionnaire data against schema
    let validatedData;
    try {
      validatedData = petsResponseSchema.parse(questionnaireData);
    } catch (validationError) {
      console.error('Questionnaire data validation failed:', validationError);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid questionnaire data',
          details: validationError instanceof z.ZodError ? validationError.errors : undefined
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate session exists, is not used, and not expired
    const { data: session, error: sessionError } = await supabase
      .from('participant_calls')
      .select('*')
      .eq('session_token', sessionToken)
      .eq('token_used', false)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (sessionError || !session) {
      console.error('Session validation failed:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if questionnaire already submitted for this session
    const { data: existingResponse, error: existingError } = await supabase
      .from('pets_responses')
      .select('id')
      .eq('prolific_id', validatedData.prolific_id)
      .eq('call_id', validatedData.call_id)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing responses:', existingError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingResponse) {
      console.log('Questionnaire already submitted for this session');
      return new Response(
        JSON.stringify({ error: 'Questionnaire already submitted' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert questionnaire response
    const { error: insertError } = await supabase
      .from('pets_responses')
      .insert([validatedData]);

    if (insertError) {
      console.error('Failed to insert questionnaire response:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save questionnaire' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark session token as used
    const { error: updateError } = await supabase
      .from('participant_calls')
      .update({ token_used: true })
      .eq('session_token', sessionToken);

    if (updateError) {
      console.error('Failed to mark token as used:', updateError);
      // Note: Questionnaire is already saved, so we return success
      // but log the token update failure
    }

    console.log('Questionnaire submitted successfully for prolific_id:', validatedData.prolific_id);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Questionnaire submitted successfully' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in submit-questionnaire:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
