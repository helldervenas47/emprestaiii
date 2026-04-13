import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Get caller from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await adminClient.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is admin
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas administradores podem criar usuários" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, username, display_name, role } = await req.json();

    if (!password || !role) {
      return new Response(JSON.stringify({ error: "Senha e papel são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build user creation params
    const userParams: any = {
      password,
      email_confirm: true,
      user_metadata: { display_name: display_name || username || email || "Usuário", username },
    };

    if (email) {
      userParams.email = email;
    } else {
      // Generate a placeholder email using username or random id
      const placeholder = username || crypto.randomUUID().slice(0, 8);
      userParams.email = `${placeholder}@placeholder.local`;
    }

    // Create user with service role (auto-confirms)
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser(userParams);

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update profile with username
    if (username || display_name) {
      await adminClient
        .from("profiles")
        .update({ username, display_name: display_name || username || email || "Usuário" })
        .eq("user_id", newUser.user.id);
    }

    // Assign role
    await adminClient.from("user_roles").insert({
      user_id: newUser.user.id,
      role,
    });

    // Link sub-user to the admin who created them
    await adminClient.from("user_owner").insert({
      user_id: newUser.user.id,
      owner_id: caller.id,
    });

    // Create default tab permissions
    await adminClient.from("user_tab_permissions").insert({
      user_id: newUser.user.id,
      allowed_tabs: ['overview','dashboard','calendar','clients','products','vehicles','expenses','overdue'],
    });

    return new Response(JSON.stringify({ user: newUser.user }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
