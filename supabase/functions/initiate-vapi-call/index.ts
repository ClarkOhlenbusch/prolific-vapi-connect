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
    const { sessionToken, prolificId } = await req.json();

    if (!sessionToken || !prolificId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
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
      return new Response(
        JSON.stringify({ error: 'Session already has an active call' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initiate VAPI call server-side
    const vapiPublicKey = Deno.env.get('VITE_VAPI_PUBLIC_KEY');
    const vapiAssistantId = Deno.env.get('VITE_VAPI_ASSISTANT_ID');

    if (!vapiPublicKey || !vapiAssistantId) {
      console.error('VAPI credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vapiResponse = await fetch('https://api.vapi.ai/call/web', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiPublicKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId: vapiAssistantId,
        assistantOverrides: {
          metadata: { prolificId }
        }
      }),
    });

    if (!vapiResponse.ok) {
      console.error('VAPI API error:', vapiResponse.status);
      return new Response(
        JSON.stringify({ error: 'Failed to initiate call' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callData = await vapiResponse.json();

    console.log('VAPI call initiated successfully');

    return new Response(
      JSON.stringify({ 
        callId: callData.id,
        webCallUrl: callData.webCallUrl
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
