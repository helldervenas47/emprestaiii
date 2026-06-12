// Cliente Supabase apontando EXCLUSIVAMENTE para o projeto do usuário
// (syyxnqzxqabeuqbuptkh). NUNCA fazer fallback para a Lovable Cloud
// (VITE_SUPABASE_URL) — isso causaria divergência entre o app e os bots.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const USER_SUPABASE_URL = import.meta.env.VITE_EXTERNAL_SUPABASE_URL as string;
export const USER_SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY as string;

if (!USER_SUPABASE_URL || !USER_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    '[supabase] VITE_EXTERNAL_SUPABASE_URL e VITE_EXTERNAL_SUPABASE_ANON_KEY são obrigatórios no .env. Não use VITE_SUPABASE_URL (Lovable Cloud).',
  );
}

export const supabase = createClient<Database>(USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
    // PWA-friendly OAuth: usa PKCE (sem expor token na URL) e troca o
    // ?code=... automaticamente no retorno do Google, sem reload extra.
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
