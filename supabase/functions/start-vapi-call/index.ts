import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
interface StartCallRequest {
  sessionToken: string;
  prolificId: string;
  phoneNumber: string;
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
    const body = await req.json() as StartCallRequest;
    const { sessionToken, prolificId, phoneNumber } = body;

    // Input validation
    if (!sessionToken || typeof sessionToken !== 'string') {
      console.error('Invalid sessionToken format');
      return new Response(
        JSON.stringify({ error: 'Invalid session token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!validateUUID(sessionToken)) {
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

    if (!phoneNumber || typeof phoneNumber !== 'string') {
      console.error('Invalid phoneNumber format');
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate E.164 format (+ followed by digits)
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      console.error('Phone number not in E.164 format');
      return new Response(
        JSON.stringify({ error: 'Phone number must be in E.164 format (e.g., +1234567890)' }),
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
      console.error('Session already has an active call');
      return new Response(
        JSON.stringify({ error: 'Session already has an active call' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get VAPI credentials from environment
    const vapiPrivateKey = Deno.env.get('VAPI_PRIVATE_KEY');
    const vapiAssistantId = Deno.env.get('VITE_VAPI_ASSISTANT_ID');
    const vapiPhoneNumberId = Deno.env.get('VAPI_PHONE_NUMBER_ID');

    if (!vapiPrivateKey || !vapiAssistantId || !vapiPhoneNumberId) {
      console.error('VAPI credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Service configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call VAPI API to start the call server-side
    console.log('Starting VAPI call for session');
    const vapiResponse = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiPrivateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId: vapiPhoneNumberId,
        customer: {
          number: phoneNumber
        },
        assistantId: vapiAssistantId,
        assistantOverrides: {
          variableValues: {
            prolificId: prolificId,
            sessionToken: sessionToken
          }
        }
      }),
    });

    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      console.error('VAPI API error:', vapiResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to initiate call' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callData = await vapiResponse.json();
    console.log('VAPI call started successfully');

    // Update the session with the call ID
    const { error: updateError } = await supabase
      .from('participant_calls')
      .update({ call_id: callData.id })
      .eq('session_token', sessionToken);

    if (updateError) {
      console.error('Failed to update call_id:', updateError);
      // Continue anyway - the call is active
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        callId: callData.id,
        message: 'Call started successfully'
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
