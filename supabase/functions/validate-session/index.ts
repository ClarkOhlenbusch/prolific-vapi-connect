import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { sessionToken } = body;

    // Input validation
    if (!sessionToken || typeof sessionToken !== 'string') {
      console.error('Invalid sessionToken format');
      return new Response(
        JSON.stringify({ error: 'Invalid session token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionToken)) {
      console.error('Session token is not a valid UUID');
      return new Response(
        JSON.stringify({ error: 'Invalid session token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role to bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate session token and get participant data
    // Token must exist and not be used yet
  const { data: participantCall, error: callError } = await supabase
    .from('participant_calls')
    .select('prolific_id, call_id, created_at, is_completed, expires_at')
    .eq('session_token', sessionToken)
    .eq('is_completed', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (callError) {
    console.error('Session validation failed');
    return new Response(
      JSON.stringify({ error: 'Operation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  if (!participantCall) {
    return new Response(
      JSON.stringify({ valid: false, error: 'Invalid, expired, or already used session token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

    // Optionally fetch PETS responses for this participant
    const { data: petsResponse } = await supabase
      .from('pets_responses')
      .select('*')
      .eq('call_id', participantCall.call_id)
      .maybeSingle();

    return new Response(
      JSON.stringify({
        valid: true,
        participant: {
          prolificId: participantCall.prolific_id,
          callId: participantCall.call_id,
          createdAt: participantCall.created_at,
          hasCompletedQuestionnaire: !!petsResponse
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in validate-session function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
