// Helper para acessar EXCLUSIVAMENTE o Supabase EXTERNO do usuário
// (syyxnqzxqabeuqbuptkh). Sem fallback para o projeto da Lovable Cloud,
// caso contrário webhooks e validações de código apontam para o banco errado.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function required(name: string): string {
  const v = Deno.env.get(name);
  if (!v) {
    throw new Error(
      `[external-supabase] secret ${name} não configurado. Configure-o em Settings → Secrets para apontar ao projeto externo (syyxnqzxqabeuqbuptkh).`,
    );
  }
  return v;
}

export function getExternalSupabaseUrl(): string {
  return required("EXTERNAL_SUPABASE_URL");
}

export function getExternalServiceRoleKey(): string {
  return required("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
}

export function getExternalAnonKey(): string {
  return required("EXTERNAL_SUPABASE_ANON_KEY");
}

/** Admin client (service role) apontando ao Supabase EXTERNO. */
export function getExternalAdmin(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalServiceRoleKey());
}

/** Anon client usado para validar JWTs emitidos pelo Supabase EXTERNO. */
export function getExternalUserClient(): SupabaseClient {
  return createClient(getExternalSupabaseUrl(), getExternalAnonKey());
}
