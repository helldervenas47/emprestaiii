import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(`[supabase] Variável ${name} não configurada.`);
  }
  return v;
}

function getNamedKey(name: string): string | null {
  const raw = Deno.env.get(name);
  if (!raw) return null;

  try {
    const keys = JSON.parse(raw) as Record<string, unknown>;
    if (typeof keys.default === "string") return keys.default;
    return Object.values(keys).find((value): value is string => typeof value === "string") ?? null;
  } catch {
    throw new Error(`[supabase] Variável ${name} não contém um objeto JSON válido.`);
  }
}

export function getSupabaseUrl(): string {
  return required("SUPABASE_URL");
}

export function getServiceRoleKey(): string {
  return (
    getNamedKey("SUPABASE_SECRET_KEYS") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    required("SUPABASE_SECRET_KEYS ou SUPABASE_SERVICE_ROLE_KEY")
  );
}

export function getAnonKey(): string {
  return (
    getNamedKey("SUPABASE_PUBLISHABLE_KEYS") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    required("SUPABASE_PUBLISHABLE_KEYS ou SUPABASE_ANON_KEY")
  );
}

export function getAdminClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getUserClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getAnonKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
