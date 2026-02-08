import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateResearcherSessionRequest {
  source?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse optional body
    let source = 'researcher_mode';
    try {
      const body = (await req.json()) as CreateResearcherSessionRequest;
      if (body.source) {
        source = body.source;
      }
    } catch {
      // No body or invalid JSON is fine
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

    // Get next researcher ID from sequence (atomic, concurrency-safe)
    const { data: seqData, error: seqError } = await supabase.rpc('nextval', {
      sequence_name: 'researcher_session_seq',
    });

    // If RPC doesn't work, use raw SQL via postgres function
    let researcherNumber: number;
    
    if (seqError) {
      // Fallback: query the sequence directly
      const { data: sqlData, error: sqlError } = await supabase
        .from('participant_calls')
        .select('prolific_id')
        .like('prolific_id', 'researcher%')
        .order('created_at', { ascending: false })
        .limit(100);

      if (sqlError) {
        console.error('Failed to query existing researcher IDs:', sqlError);
        return new Response(
          JSON.stringify({ error: 'Failed to generate researcher ID' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Extract max number from existing researcher IDs
      let maxNum = 0;
      if (sqlData) {
        for (const row of sqlData) {
          const match = row.prolific_id?.match(/^researcher(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      }
      researcherNumber = maxNum + 1;
    } else {
      researcherNumber = typeof seqData === 'number' ? seqData : parseInt(String(seqData), 10);
    }

    const prolificId = `researcher${researcherNumber}`;
    const sessionToken = crypto.randomUUID();
    const callId = `researcher-call-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Insert into participant_calls
    const { error: insertError } = await supabase
      .from('participant_calls')
      .insert({
        prolific_id: prolificId,
        call_id: callId,
        session_token: sessionToken,
        expires_at: expiresAt,
        token_used: false,
      });

    if (insertError) {
      console.error('Failed to create researcher session:', insertError);
      
      // If it's a unique constraint violation, try again with a higher number
      if (insertError.code === '23505') {
        return new Response(
          JSON.stringify({ error: 'Researcher ID collision, please retry' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        prolificId,
        callId,
        sessionToken,
        expiresAt,
        source,
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
