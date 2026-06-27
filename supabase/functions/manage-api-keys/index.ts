// Edge function: manage-api-keys
// Armazena/lista/atualiza/remove chaves de API do usuário SEM nunca
// devolver o valor completo da chave ao frontend.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function last4(s: string): string {
  const trimmed = (s ?? "").trim();
  if (trimmed.length <= 4) return trimmed;
  return trimmed.slice(-4);
}

function sanitize(row: any) {
  return {
    id: row.id,
    name: row.name,
    key_last4: row.key_last4,
    active: row.active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return json({ error: "missing_token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) return json({ error: "invalid_token" }, 401);
  const userId = userRes.user.id;

  try {
    if (req.method === "GET") {
      const { data, error } = await admin
        .from("user_api_keys")
        .select("id,name,key_last4,active,created_at,last_used_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ keys: (data ?? []).map(sanitize) });
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const id = typeof body?.id === "string" ? body.id : null;
      const name = String(body?.name ?? "").trim();
      const key = String(body?.key ?? "").trim();
      const active =
        typeof body?.active === "boolean" ? body.active : undefined;

      if (!name) return json({ error: "name_required" }, 400);
      if (name.length > 80) return json({ error: "name_too_long" }, 400);

      if (id) {
        // Update — key é opcional (permite só renomear / ativar)
        const patch: Record<string, unknown> = { name };
        if (key) {
          patch.key = key;
          patch.key_last4 = last4(key);
        }
        if (active !== undefined) patch.active = active;

        const { data, error } = await admin
          .from("user_api_keys")
          .update(patch)
          .eq("id", id)
          .eq("user_id", userId)
          .select("id,name,key_last4,active,created_at,last_used_at")
          .maybeSingle();
        if (error) throw error;
        if (!data) return json({ error: "not_found" }, 404);
        return json({ key: sanitize(data) });
      }

      // Insert — key obrigatória
      if (!key) return json({ error: "key_required" }, 400);
      if (key.length > 4096) return json({ error: "key_too_long" }, 400);

      const { data, error } = await admin
        .from("user_api_keys")
        .upsert(
          {
            user_id: userId,
            name,
            key,
            key_last4: last4(key),
            active: active ?? true,
          },
          { onConflict: "user_id,name" },
        )
        .select("id,name,key_last4,active,created_at,last_used_at")
        .single();
      if (error) throw error;
      return json({ key: sanitize(data) });
    }

    if (req.method === "DELETE") {
      const body = await req.json().catch(() => ({}));
      const id = typeof body?.id === "string" ? body.id : null;
      if (!id) return json({ error: "id_required" }, 400);
      const { error } = await admin
        .from("user_api_keys")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "method_not_allowed" }, 405);
  } catch (e) {
    // Nunca logar a `key` em texto puro
    console.error("[manage-api-keys]", (e as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
});
