import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Validation regex for Prolific ID
const PROLIFIC_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('VAPI_WEBHOOK_SECRET');
    
    if (!webhookSecret) {
      console.error('VAPI_WEBHOOK_SECRET not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the raw body for signature verification
    const rawBody = await req.text();
    const signature = req.headers.get('x-vapi-signature');

    if (!signature) {
      console.error('Missing x-vapi-signature header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - missing signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify HMAC signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(rawBody)
    );

    const computedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

  if (signature !== computedSignature) {
    console.error('Webhook signature verification failed');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = JSON.parse(rawBody);

    // Validate input before processing
    if (payload.message?.type === 'status-update' && payload.message?.call) {
      const callId = payload.message.call.id;
      const metadata = payload.message.call.assistantOverrides?.metadata || payload.message.call.metadata || {};
      const prolificId = metadata.prolificId;

      // Validate inputs
      if (!callId || typeof callId !== 'string' || callId.length > 255) {
        console.error('Invalid call ID');
        return new Response(
          JSON.stringify({ error: 'Invalid call ID' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Validate prolificId format and length
      if (!prolificId || 
          typeof prolificId !== 'string' || 
          prolificId.length === 0 ||
          prolificId.length > 100 ||
          !PROLIFIC_ID_REGEX.test(prolificId)) {
        console.error('Invalid prolificId format');
        return new Response(
          JSON.stringify({ error: 'Invalid prolificId format. Must contain only letters, numbers, hyphens, and underscores (max 100 characters)' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (callId && prolificId) {
        // Update existing participant_calls record instead of inserting
        const { error } = await supabase
          .from('participant_calls')
          .update({ call_id: callId })
          .eq('prolific_id', prolificId)
          .is('call_id', null);

        if (error) {
          console.error('Database update failed');
          return new Response(
            JSON.stringify({ error: 'Operation failed' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
