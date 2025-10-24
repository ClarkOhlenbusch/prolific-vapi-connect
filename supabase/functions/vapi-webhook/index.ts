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
    // Verify VAPI webhook signature
    const signature = req.headers.get('x-vapi-signature');
    const webhookSecret = Deno.env.get('VAPI_WEBHOOK_SECRET');

    if (!signature || !webhookSecret) {
      console.error('Missing signature or webhook secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (signature !== webhookSecret) {
      console.error('Invalid webhook signature');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log('Vapi webhook received (verified):', JSON.stringify(payload, null, 2));

    // Validate input before processing
    if (payload.message?.type === 'status-update' && payload.message?.call) {
      const callId = payload.message.call.id;
      const metadata = payload.message.call.assistantOverrides?.metadata || payload.message.call.metadata || {};
      const prolificId = metadata.prolificId;

      console.log('Call ID:', callId);
      console.log('Prolific ID:', prolificId);

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
        const { data, error } = await supabase
          .from('participant_calls')
          .insert({
            prolific_id: prolificId,
            call_id: callId,
          });

        if (error) {
          console.error('Error inserting call data:', error);
          const errorMessage = error?.message || 'Database insert failed';
          return new Response(
            JSON.stringify({ error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Successfully stored call data:', data);
      } else {
        console.log('Missing callId or prolificId in payload');
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
