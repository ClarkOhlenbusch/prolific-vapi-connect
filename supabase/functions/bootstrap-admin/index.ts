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
    const { email, password, bootstrapSecret } = await req.json();

    // Validate bootstrap secret from environment variable
    const expectedSecret = Deno.env.get('BOOTSTRAP_SECRET');
    if (!expectedSecret || bootstrapSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: 'Invalid bootstrap secret' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Check if any super_admin already exists
    const { data: existingAdmins } = await supabaseAdmin
      .from('researcher_roles')
      .select('id')
      .eq('role', 'super_admin')
      .limit(1);

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(
        JSON.stringify({ error: 'A super admin already exists. Use the dashboard to add more.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create the auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return new Response(
        JSON.stringify({ error: authError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Add super_admin role
    const { error: roleError } = await supabaseAdmin
      .from('researcher_roles')
      .insert({
        user_id: authData.user.id,
        role: 'super_admin',
      });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: roleError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Super admin created successfully',
        email: authData.user.email 
      }),
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
