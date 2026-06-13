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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "missing_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = getExternalUserClient();
    const { data: userRes, error: authError } = await userClient.auth.getUser(token);
    if (authError || !userRes?.user?.id) {
      return new Response(JSON.stringify({ error: "invalid_token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userRes.user.id;
    const admin = getExternalAdmin();
    const { data: existingRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if ((existingRoles ?? []).length > 0) {
      return new Response(JSON.stringify({ ok: true, role: existingRoles?.[0]?.role ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let insert = await admin.from("user_roles").insert({ user_id: userId, role: "cliente" });
    if (insert.error && insert.error.message.toLowerCase().includes("enum")) {
      await ensureClienteEnum(admin);
      insert = await admin.from("user_roles").insert({ user_id: userId, role: "cliente" });
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