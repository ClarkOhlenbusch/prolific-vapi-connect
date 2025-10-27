import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateCallIdRequest {
  sessionToken: string;
  prolificId: string;
  callId: string;
}

const validateUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as UpdateCallIdRequest;
    const { sessionToken, prolificId, callId } = body;

    // Input validation
    if (!sessionToken || typeof sessionToken !== 'string' || !validateUUID(sessionToken)) {
      console.error('Invalid sessionToken format');
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

    if (!callId || typeof callId !== 'string' || callId.length > 100) {
      console.error('Invalid callId format');
      return new Response(
        JSON.stringify({ error: 'Invalid call ID format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update call_id with service role to bypass RLS
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify session exists and belongs to this prolificId
    const { data: session, error: sessionError } = await supabase
      .from('participant_calls')
      .select('*')
      .eq('session_token', sessionToken)
      .eq('prolific_id', prolificId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (sessionError || !session) {
      console.error('Session validation failed');
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update the call_id
    const { error: updateError } = await supabase
      .from('participant_calls')
      .update({ call_id: callId })
      .eq('session_token', sessionToken)
      .eq('prolific_id', prolificId);

    if (updateError) {
      console.error('Failed to update call_id:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update call ID' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Call ID updated successfully:', callId);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Call ID updated successfully'
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
