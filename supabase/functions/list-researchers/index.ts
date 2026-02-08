import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify their identity
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    // Get the calling user
    const { data: { user: callingUser }, error: userError } = await supabaseUser.auth.getUser();
    
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid user session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check if calling user is a researcher (super_admin or viewer)
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('researcher_roles')
      .select('role')
      .eq('user_id', callingUser.id)
      .single();

    if (roleError || !roleData) {
      return new Response(
        JSON.stringify({ error: 'Not authorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all researcher roles
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from('researcher_roles')
      .select('*')
      .order('created_at', { ascending: false });

    if (rolesError) {
      return new Response(
        JSON.stringify({ error: rolesError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all auth users to map emails
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map emails to roles
    const usersWithEmails = roles?.map(role => {
      const authUser = authUsers.users.find(u => u.id === role.user_id);
      const metadataUsername = authUser?.user_metadata?.username;
      const rawMetadataUsername = authUser?.raw_user_meta_data?.username;
      const usernameValue =
        (typeof metadataUsername === 'string' && metadataUsername.trim()) ||
        (typeof rawMetadataUsername === 'string' && rawMetadataUsername.trim()) ||
        null;
      return {
        ...role,
        email: authUser?.email || 'Unknown',
        username: usernameValue,
      };
    }) || [];

    return new Response(
      JSON.stringify({ users: usersWithEmails }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
