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

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

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

    const newUserId = newUser.user.id;

    // Update profile with username
    if (username || display_name) {
      await adminClient
        .from("profiles")
        .update({ username, display_name: display_name || username || email || "Usuário" })
        .eq("user_id", newUserId);
    }

    // Assign role (upsert to be resilient to handle_new_user defaults)
    const desiredRole = role || "cliente";
    const { error: roleErr } = await adminClient
      .from("user_roles")
      .upsert({ user_id: newUserId, role: desiredRole }, { onConflict: "user_id,role" });
    if (roleErr) {
      console.error("[admin-create-user] role insert failed", roleErr);
      return new Response(
        JSON.stringify({ error: `Usuário criado, mas falhou ao atribuir papel: ${roleErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    // Link sub-user to the admin who created them
    await adminClient.from("user_owner").insert({
      user_id: newUserId,
      owner_id: caller.id,
    });

    // --- Sync plan from admin to new user ---
    // Fetch admin's subscription (try sandbox first, then live)
    const { data: adminSubSandbox } = await adminClient
      .from("subscriptions")
      .select("product_id, price_id")
      .eq("user_id", caller.id)
      .eq("environment", "sandbox")
      .maybeSingle();

    const { data: adminSubLive } = await adminClient
      .from("subscriptions")
      .select("product_id, price_id")
      .eq("user_id", caller.id)
      .eq("environment", "live")
      .maybeSingle();

    const adminProductId = adminSubSandbox?.product_id || adminSubLive?.product_id || "free_plan";
    const adminPriceId = adminSubSandbox?.price_id || adminSubLive?.price_id || "free";

    // Update the new user's subscriptions (created by handle_new_user trigger) to match admin's plan
    await adminClient
      .from("subscriptions")
      .update({ product_id: adminProductId, price_id: adminPriceId })
      .eq("user_id", newUserId)
      .eq("environment", "sandbox");

    await adminClient
      .from("subscriptions")
      .update({ product_id: adminProductId, price_id: adminPriceId })
      .eq("user_id", newUserId)
      .eq("environment", "live");

    // Sync tab permissions based on admin's plan
    const planNameMap: Record<string, string> = {
      free_plan: "Free",
      basico_plan: "Básico",
      profissional_plan: "Profissional",
      empresarial_plan: "Empresarial",
    };
    const planName = planNameMap[adminProductId];
    if (planName) {
      const { data: plan } = await adminClient
        .from("plans")
        .select("allowed_tabs")
        .eq("name", planName)
        .eq("active", true)
        .maybeSingle();

      if (plan?.allowed_tabs) {
        // Update the default tab permissions created above
        await adminClient
          .from("user_tab_permissions")
          .update({ allowed_tabs: plan.allowed_tabs, updated_at: new Date().toISOString() })
          .eq("user_id", newUserId);
      }
    }

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
