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
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    // Cryptographically verify the JWT against Supabase's auth server
    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas administradores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, user_id, role, display_name, username, email, password } = body;

    if (action === "list") {
      // Paginate through ALL auth users (default perPage is 50).
      // Without this loop, admins only see the first page of users and
      // cannot manage tab permissions for users beyond that page.
      const allUsers: any[] = [];
      let page = 1;
      const perPage = 1000;
      // Safety cap to avoid runaway loops
      for (let i = 0; i < 50; i++) {
        const { data: pageData, error: pageErr } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (pageErr) break;
        const batch = pageData?.users ?? [];
        allUsers.push(...batch);
        if (batch.length < perPage) break;
        page += 1;
      }

      const { data: roles } = await adminClient.from("user_roles").select("*");
      const { data: profiles } = await adminClient.from("profiles").select("*");
      const { data: tabPerms } = await adminClient.from("user_tab_permissions").select("*");
      const { data: clientPerms } = await adminClient.from("user_client_permissions").select("*");
      const { data: owners } = await adminClient.from("user_owner").select("user_id, owner_id");

      const normalizeName = (value: string | null | undefined) =>
        (value || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .trim();

      const ownerByUserId = new Map((owners || []).map((o) => [o.user_id, o.owner_id]));
      const legacyCreatedByMe = allUsers.filter((u) => {
        const profile = profiles?.find((p) => p.user_id === u.id);
        const name = normalizeName(profile?.display_name || profile?.full_name || u.user_metadata?.display_name || u.email);
        return (
          (name.includes("renan") && name.includes("mota")) ||
          (name.includes("thiago") && name.includes("ferraz")) ||
          (name.includes("helder") && name.includes("venas"))
        );
      });

      if (legacyCreatedByMe.length > 0) {
        await adminClient.from("user_owner").upsert(
          legacyCreatedByMe.map((u) => ({ user_id: u.id, owner_id: callerId })),
          { onConflict: "user_id" },
        );
        legacyCreatedByMe.forEach((u) => ownerByUserId.set(u.id, callerId));
      }

      const enriched = allUsers.map((u) => ({
        id: u.id,
        email: u.email,
        display_name: profiles?.find((p) => p.user_id === u.id)?.display_name || u.email,
        username: profiles?.find((p) => p.user_id === u.id)?.username || null,
        role: roles?.find((r) => r.user_id === u.id)?.role || null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        is_active: !u.banned_until || new Date(u.banned_until) <= new Date(),
        allowed_tabs: tabPerms?.find((t) => t.user_id === u.id)?.allowed_tabs || null,
        linked_client_ids: clientPerms?.filter((c) => c.user_id === u.id).map((c) => c.client_id) || [],
        owner_id: ownerByUserId.get(u.id) || null,
      }));

      return new Response(JSON.stringify({ users: enriched }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_role") {
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id e role são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Upsert role
      const { data: existing } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      if (existing) {
        await adminClient.from("user_roles").update({ role }).eq("user_id", user_id);
      } else {
        await adminClient.from("user_roles").insert({ user_id, role });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_user") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update auth user (email/password)
      const updateData: Record<string, unknown> = {};
      if (email) updateData.email = email;
      if (password) updateData.password = password;
      if (Object.keys(updateData).length > 0) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(user_id, updateData);
        if (authErr) {
          return new Response(JSON.stringify({ error: authErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Update profile
      const profileUpdate: Record<string, unknown> = {};
      if (display_name !== undefined) profileUpdate.display_name = display_name;
      if (username !== undefined) profileUpdate.username = username || null;
      if (Object.keys(profileUpdate).length > 0) {
        await adminClient.from("profiles").update(profileUpdate).eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_permissions") {
      if (!user_id || !body.allowed_tabs) {
        return new Response(JSON.stringify({ error: "user_id e allowed_tabs são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: existing } = await adminClient
        .from("user_tab_permissions")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      if (existing) {
        await adminClient.from("user_tab_permissions").update({ allowed_tabs: body.allowed_tabs }).eq("user_id", user_id);
      } else {
        await adminClient.from("user_tab_permissions").insert({ user_id, allowed_tabs: body.allowed_tabs });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_client_links") {
      if (!user_id || !body.client_ids) {
        return new Response(JSON.stringify({ error: "user_id e client_ids são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Remove all existing links then insert new ones
      await adminClient.from("user_client_permissions").delete().eq("user_id", user_id);
      const clientIds = body.client_ids as string[];
      if (clientIds.length > 0) {
        await adminClient.from("user_client_permissions").insert(
          clientIds.map((cid: string) => ({ user_id, client_id: cid }))
        );
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "Não é possível excluir seu próprio usuário" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await adminClient.from("user_client_permissions").delete().eq("user_id", user_id);
      await adminClient.from("user_tab_permissions").delete().eq("user_id", user_id);
      await adminClient.from("user_owner").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.auth.admin.deleteUser(user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_active") {
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const active = body.active as boolean;
      const { error: banErr } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: active ? "none" : "876600h",
      });
      if (banErr) {
        return new Response(JSON.stringify({ error: banErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
