import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller identity via JWT
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    const { data: { user: callingUser }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid user session' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify super_admin role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("researcher_roles")
      .select("role")
      .eq("user_id", callingUser.id)
      .single();

    if (roleError || !roleData || roleData.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: 'Only super admins can add viewers' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    if (existingUser) {
      // Check if they already have a role
      const { data: existingRole } = await supabaseAdmin
        .from("researcher_roles")
        .select("*")
        .eq("user_id", existingUser.id)
        .single();
      
      if (existingRole) {
        return new Response(
          JSON.stringify({ error: "User already has researcher access" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Add viewer role to existing user
      const { error: insertError } = await supabaseAdmin
        .from("researcher_roles")
        .insert({ user_id: existingUser.id, role: "viewer" });
      
      if (insertError) throw insertError;
      
      return new Response(
        JSON.stringify({ success: true, message: "Viewer role added to existing user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create new user with a temporary password (they'll reset it)
    const tempPassword = crypto.randomUUID();
    
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (createError) throw createError;

    // Add viewer role
    const { error: insertError } = await supabaseAdmin
      .from("researcher_roles")
      .insert({ user_id: newUser.user.id, role: "viewer" });

    if (insertError) {
      // Rollback: delete the user if role insertion fails
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      throw insertError;
    }

    // Generate password reset link
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (resetError) {
      console.error("Failed to generate reset link:", resetError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Viewer created successfully",
        resetLink: resetData?.properties?.action_link || null,
        userId: newUser.user.id
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
