import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { sessionToken, prolificId, restart = false } = body;

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

    if (!prolificId || typeof prolificId !== 'string' || prolificId.length > 100) {
      console.error('Invalid prolificId format');
      return new Response(
        JSON.stringify({ error: 'Invalid participant ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate session with service role to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: session, error: sessionError } = await supabase
      .from('participant_calls')
      .select('*')
      .eq('session_token', sessionToken)
      .eq('prolific_id', prolificId)
      .eq('token_used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session) {
      console.error('Session validation failed');
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: check if session already has an active call
    if (session.call_id && session.call_id !== '') {
      // If restart flag is true, clear the old call_id
      if (restart === true) {
        console.log('Restart requested, clearing old call_id');
        const { error: updateError } = await supabase
          .from('participant_calls')
          .update({ call_id: '' })
          .eq('session_token', sessionToken)
          .eq('prolific_id', prolificId);
        
        if (updateError) {
          console.error('Failed to clear call_id:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to restart session' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log('Old call_id cleared successfully');
      } else {
        return new Response(
          JSON.stringify({ error: 'Session already has an active call' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Session is valid, allow client to proceed with VAPI call
    console.log('Session validated successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Session validated'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Edge function error:', error instanceof Error ? error.message : 'Unknown error');
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
