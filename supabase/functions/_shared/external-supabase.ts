// Shared helper to access the user's EXTERNAL Supabase project (not Lovable Cloud).
// Falls back to SUPABASE_* env vars if EXTERNAL_* are not configured.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getExternalSupabaseUrl(): string {
  return (Deno.env.get("EXTERNAL_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL"))!;
}

export function getExternalServiceRoleKey(): string {
  return (Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!;
}

export function getExternalAnonKey(): string {
  return (Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY"))!;
}

/** Admin client (service role) pointing at the EXTERNAL Supabase project. */
export function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey());
}

/** Anon client used to validate user JWTs issued by the EXTERNAL Supabase project. */
export function getExternalUserClient(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalAnonKey());
}
