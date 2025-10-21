import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload = await req.json();
    console.log('Vapi webhook received:', JSON.stringify(payload, null, 2));

    // Vapi sends different event types - we're interested in call.started or call.ended
    // which contain the call.id
    if (payload.message?.type === 'call-start' || payload.message?.call) {
      const callId = payload.message?.call?.id || payload.message?.callId;
      const metadata = payload.message?.call?.metadata || {};
      const prolificId = metadata.prolificId;

      console.log('Call ID:', callId);
      console.log('Prolific ID:', prolificId);

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
