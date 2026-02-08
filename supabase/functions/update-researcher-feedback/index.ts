import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateResearcherFeedbackRequest {
  sessionToken: string;
  prolificId?: string;
  callId?: string;
  formality?: number | null;
  voiceAssistantFeedback: string;
  communicationStyleFeedback: string;
  experimentFeedback: string;
  assistantType?: string | null;
}

const validateUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

const buildDraftExperimentResponse = (prolificId: string, callId: string, payload: {
  formality: number;
  voiceAssistantFeedback: string;
  communicationStyleFeedback: string;
  experimentFeedback: string;
  assistantType?: string | null;
}) => ({
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
  e4_position: 4,
  e5_position: 5,
  e6_position: 6,
  u1_position: 7,
  u2_position: 8,
  u3_position: 9,
  u4_position: 10,
  pets_er: 50,
  pets_ut: 50,
  pets_total: 50,
  intention_1: 4,
  intention_2: 4,
  formality: payload.formality,
  voice_assistant_feedback: payload.voiceAssistantFeedback,
  communication_style_feedback: payload.communicationStyleFeedback,
  experiment_feedback: payload.experimentFeedback,
  assistant_type: payload.assistantType || null,
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as UpdateResearcherFeedbackRequest;
    const {
      sessionToken,
      prolificId,
      callId,
      formality,
      voiceAssistantFeedback,
      communicationStyleFeedback,
      experimentFeedback,
      assistantType,
    } = body;

    if (!sessionToken || typeof sessionToken !== 'string' || !validateUUID(sessionToken)) {
      return new Response(
        JSON.stringify({ error: 'Invalid session token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (typeof voiceAssistantFeedback !== 'string' || typeof communicationStyleFeedback !== 'string' || typeof experimentFeedback !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid feedback payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (voiceAssistantFeedback.length > 2500 || communicationStyleFeedback.length > 2500 || experimentFeedback.length > 2500) {
      return new Response(
        JSON.stringify({ error: 'Feedback exceeds maximum length' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const numericFormality = typeof formality === 'number' && Number.isFinite(formality)
      ? Math.min(7, Math.max(1, formality))
      : 4;

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: sessionRow, error: sessionError } = await supabase
      .from('participant_calls')
      .select('id, prolific_id, call_id')
      .eq('session_token', sessionToken)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      console.error('Session lookup failed for update-researcher-feedback:', sessionError);
      return new Response(
        JSON.stringify({ error: 'Session not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const targetProlificId = prolificId || sessionRow.prolific_id;
    const targetCallId = callId || sessionRow.call_id || `researcher-call-${sessionToken}`;
    const updatePayload = {
      call_id: targetCallId,
      formality: numericFormality,
      voice_assistant_feedback: voiceAssistantFeedback || 'Not provided',
      communication_style_feedback: communicationStyleFeedback || 'Not provided',
      experiment_feedback: experimentFeedback || 'Not provided',
      assistant_type: assistantType || null,
    };

    const { data: exactMatchRows, error: exactMatchError } = await supabase
      .from('experiment_responses')
      .update(updatePayload)
      .eq('prolific_id', targetProlificId)
      .eq('call_id', targetCallId)
      .select('id, prolific_id, call_id')
      .limit(1);

    if (exactMatchError) {
      console.error('Exact-match update failed for researcher feedback:', exactMatchError);
      return new Response(
        JSON.stringify({ error: 'Failed to update researcher feedback' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (exactMatchRows && exactMatchRows.length > 0) {
      return new Response(
        JSON.stringify({ success: true, mode: 'exact_match', rowId: exactMatchRows[0].id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: prolificFallbackRows, error: prolificFallbackError } = await supabase
      .from('experiment_responses')
      .update(updatePayload)
      .eq('prolific_id', targetProlificId)
      .select('id, prolific_id, call_id')
      .limit(1);

    if (prolificFallbackError) {
      console.error('Prolific-id fallback update failed for researcher feedback:', prolificFallbackError);
      return new Response(
        JSON.stringify({ error: 'Failed to update researcher feedback' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (prolificFallbackRows && prolificFallbackRows.length > 0) {
      return new Response(
        JSON.stringify({ success: true, mode: 'prolific_fallback', rowId: prolificFallbackRows[0].id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from('experiment_responses')
      .insert(buildDraftExperimentResponse(targetProlificId, targetCallId, {
        formality: numericFormality,
        voiceAssistantFeedback: updatePayload.voice_assistant_feedback,
        communicationStyleFeedback: updatePayload.communication_style_feedback,
        experimentFeedback: updatePayload.experiment_feedback,
        assistantType: assistantType || null,
      }))
      .select('id')
      .limit(1);

    if (insertError) {
      console.error('Draft insert failed for researcher feedback fallback:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create researcher feedback draft row' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, mode: 'insert_fallback', rowId: insertedRows?.[0]?.id || null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('update-researcher-feedback error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
