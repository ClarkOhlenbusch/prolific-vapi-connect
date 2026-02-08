import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;

type AuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  raw_user_meta_data?: Record<string, unknown> | null;
};

const getMetadataUsername = (user: AuthUser) => {
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { username, targetUserId } = await req.json();

    if (typeof username !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing username' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const normalizedUsername = username.trim().toLowerCase();
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      return new Response(
        JSON.stringify({ error: 'Username must be 3-32 chars: letters, numbers, dot, underscore, hyphen.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false },
      },
    );

    const { data: { user: callingUser }, error: callingUserError } = await supabaseUser.auth.getUser();
    if (callingUserError || !callingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid user session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: callingRoleRow, error: callingRoleError } = await supabaseAdmin
      .from('researcher_roles')
      .select('role')
      .eq('user_id', callingUser.id)
      .maybeSingle();

    if (callingRoleError && callingRoleError.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({ error: callingRoleError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!callingRoleRow) {
      return new Response(
        JSON.stringify({ error: 'Only researchers can update usernames' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const effectiveTargetUserId =
      typeof targetUserId === 'string' && targetUserId.trim() ? targetUserId.trim() : callingUser.id;

    const isUpdatingAnotherUser = effectiveTargetUserId !== callingUser.id;
    if (isUpdatingAnotherUser && callingRoleRow.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Only super admins can change another user\'s username' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: targetRoleRow, error: targetRoleError } = await supabaseAdmin
      .from('researcher_roles')
      .select('role')
      .eq('user_id', effectiveTargetUserId)
      .maybeSingle();

    if (targetRoleError && targetRoleError.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({ error: targetRoleError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!targetRoleRow) {
      return new Response(
        JSON.stringify({ error: 'Target user does not have researcher access' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const allUsers: AuthUser[] = [];
    const perPage = 200;
    let page = 1;

    while (true) {
      const { data: userListData, error: userListError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (userListError) {
        return new Response(
          JSON.stringify({ error: userListError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const users = userListData?.users ?? [];
      allUsers.push(...users);

      if (users.length < perPage) {
        break;
      }
      page += 1;
      if (page > 100) {
        break;
      }
    }

    const targetUser = allUsers.find((u) => u.id === effectiveTargetUserId);
    if (!targetUser) {
      return new Response(
        JSON.stringify({ error: 'Target user not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const usernameTaken = allUsers.some((u) => {
      if (u.id === effectiveTargetUserId) return false;
      return getMetadataUsername(u) === normalizedUsername;
    });

    if (usernameTaken) {
      return new Response(
        JSON.stringify({ error: 'Username is already in use' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const mergedMetadata = {
      ...(targetUser.user_metadata || {}),
      username: normalizedUsername,
    };

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      effectiveTargetUserId,
      { user_metadata: mergedMetadata },
    );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: effectiveTargetUserId,
        username: normalizedUsername,
      }),
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
