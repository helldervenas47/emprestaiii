import { getExternalAdmin, getExternalUserClient } from "../_shared/external-supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function ensureClienteEnum(admin: ReturnType<typeof getExternalAdmin>) {
  await admin.rpc("exec_sql", {
    sql_query: "ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'cliente';",
  });
}

async function resolvePublicSignupUser(
  admin: ReturnType<typeof getExternalAdmin>,
  body: Record<string, unknown>,
) {
  const userId = typeof body.userId === "string" ? body.userId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!userId || !email) return null;

  const { data, error } = await admin.auth.admin.getUserById(userId);
  const user = data?.user;
  if (error || !user?.id || (user.email ?? "").trim().toLowerCase() !== email) return null;

  const createdAt = new Date(user.created_at).getTime();
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > 15 * 60 * 1000) return null;

  return user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const admin = getExternalAdmin();
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    let userRes = null;

    if (token) {
      const { data: userData, error: userTokenError } = await admin.auth.getUser(token);
      if (userTokenError || !userData?.user?.id) {
        console.error("[ensure-user-role] invalid token", userTokenError);
        // Fallback to public signup resolution (userId+email recent signup)
        userRes = await resolvePublicSignupUser(admin, body);
        if (!userRes?.id) {
          return new Response(JSON.stringify({ error: "invalid_token" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        userRes = userData.user;
      }
    } else {
      userRes = await resolvePublicSignupUser(admin, body);
    }

    if (!userRes?.id) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userRes.id;
    const displayName =
      userRes.user_metadata?.display_name ||
      userRes.user_metadata?.full_name ||
      userRes.email?.split("@")[0] ||
      "Usuário";

    await admin.from("profiles").upsert(
      {
        user_id: userId,
        email: userRes.email,
        full_name: userRes.user_metadata?.full_name || displayName,
        display_name: displayName,
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

    const { data: existingRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const validExistingRole = (existingRoles ?? []).find((r) =>
      ["admin", "gerente", "cliente", "visualizador"].includes(String(r.role)),
    );

    if (validExistingRole) {
      return new Response(JSON.stringify({ ok: true, role: validExistingRole.role ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let insert = await admin
      .from("user_roles")
      .upsert({ user_id: userId, role: "cliente" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    if (insert.error && insert.error.message.toLowerCase().includes("enum")) {
      await ensureClienteEnum(admin);
      insert = await admin
        .from("user_roles")
        .upsert({ user_id: userId, role: "cliente" }, { onConflict: "user_id,role", ignoreDuplicates: true });
    }

    if (insert.error) {
      return new Response(JSON.stringify({ error: insert.error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, role: "cliente" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ensure-user-role] fatal", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});