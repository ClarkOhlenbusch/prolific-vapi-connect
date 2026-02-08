import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  raw_user_meta_data?: Record<string, unknown> | null;
};

const getUsernameFromMetadata = (user: AuthUser) => {
  const metadataUsername =
    (typeof user.user_metadata?.username === 'string' && user.user_metadata.username) ||
    (typeof user.raw_user_meta_data?.username === 'string' && user.raw_user_meta_data.username) ||
    '';

  return metadataUsername.trim().toLowerCase();
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';

    if (!identifier) {
      return new Response(
        JSON.stringify({ error: 'Missing identifier' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const allUsers: AuthUser[] = [];
    const perPage = 200;
    let page = 1;

    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const users = data?.users ?? [];
      allUsers.push(...users);

      if (users.length < perPage) {
        break;
      }
      page += 1;

      // Safety guard for unexpectedly large projects.
      if (page > 100) {
        break;
      }
    }

    const isEmail = identifier.includes('@');
    const matchingUsers = allUsers.filter((user) => {
      if (isEmail) {
        return user.email?.toLowerCase() === identifier;
      }
      return getUsernameFromMetadata(user) === identifier;
    });

    // Unknown identifier or ambiguous username.
    if (matchingUsers.length !== 1) {
      return new Response(
        JSON.stringify({ email: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const matchedUser = matchingUsers[0];
    if (!matchedUser.email) {
      return new Response(
        JSON.stringify({ email: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('researcher_roles')
      .select('role')
      .eq('user_id', matchedUser.id)
      .maybeSingle();

    if (roleError && roleError.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({ error: roleError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!roleData) {
      return new Response(
        JSON.stringify({ email: null }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ email: matchedUser.email.toLowerCase() }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
