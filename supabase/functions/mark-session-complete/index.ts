import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarkSessionCompleteRequest {
  sessionToken: string;
  prolificId?: string;
  callId?: string;
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
    const body = (await req.json()) as MarkSessionCompleteRequest;
    const { sessionToken, prolificId, callId } = body;

    if (!sessionToken || typeof sessionToken !== 'string' || !validateUUID(sessionToken)) {
      return new Response(
        JSON.stringify({ error: 'Invalid session token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let sessionLookup = supabase
      .from('participant_calls')
      .select('id, session_token, prolific_id, call_id, is_completed')
      .eq('session_token', sessionToken);

    if (prolificId) {
      sessionLookup = sessionLookup.eq('prolific_id', prolificId);
    }
    if (callId) {
      sessionLookup = sessionLookup.eq('call_id', callId);
    }

    const { data: sessionRow, error: sessionError } = await sessionLookup.maybeSingle();
    if (sessionError || !sessionRow) {
      console.error('Session lookup failed for mark-session-complete:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { error: updateError } = await supabase
      .from('participant_calls')
      .update({ is_completed: true })
      .eq('id', sessionRow.id);

    if (updateError) {
      console.error('Failed to mark session complete:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to mark session complete' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        alreadyCompleted: sessionRow.is_completed === true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('mark-session-complete error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
