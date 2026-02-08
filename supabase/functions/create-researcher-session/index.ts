 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  interface CreateResearcherSessionRequest {
    source?: string;
  }

  const buildDraftExperimentResponse = (prolificId: string, callId: string) => ({
    prolific_id: prolificId,
    call_id: callId,
    call_attempt_number: 1,
    e1: 50,
    e2: 50,
    e3: 50,
    e4: 50,
    e5: 50,
    e6: 50,
    u1: 50,
    u2: 50,
    u3: 50,
    u4: 50,
    e1_position: 1,
    e2_position: 2,
    e3_position: 3,
    e5_position: 5,
    e6_position: 6,
    u1_position: 7,
    u2_position: 8,
    u4_position: 10,
    pets_er: 50,
    pets_ut: 50,
    pets_total: 50,
    intention_1: 4,
    intention_2: 4,
    formality: 4,
    communication_style_feedback: '',
    experiment_feedback: '',
  });

  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      try {
        await req.json() as CreateResearcherSessionRequest;
      } catch {
        // No-op.
      }

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        return new Response(
          JSON.stringify({ error: 'Server configuration error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { data: prolificId, error: idError } = await supabase.rpc('next_researcher_prolific_id');
      if (idError || !prolificId || typeof prolificId !== 'string') {
        console.error('Failed to allocate researcher ID:', idError);
          JSON.stringify({ error: 'Failed to allocate researcher ID' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const callId = `researcher-call-${crypto.randomUUID()}`;

      const { error: callInsertError } = await supabase.from('participant_calls').insert({
        prolific_id: prolificId,
        session_token: sessionToken,
        expires_at: expiresAt,
        token_used: false,
      });

      if (callInsertError) {
        console.error('Failed to create participant_calls row:', callInsertError);
        return new Response(
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

        .insert(buildDraftExperimentResponse(prolificId, callId));
      if (responseInsertError) {
        console.error('Failed to create draft experiment response:', responseInsertError);
        await supabase.from('participant_calls').delete().eq('session_token', sessionToken);
        return new Response(
          JSON.stringify({ error: 'Failed to initialize researcher response draft' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          prolificId,
          callId,
          sessionToken,
          expiresAt,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } catch (error) {
      console.error('create-researcher-session error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  });