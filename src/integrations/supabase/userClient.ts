// Cliente Supabase apontando para o projeto do usuário (NÃO Lovable Cloud).
// Lê credenciais EXCLUSIVAMENTE de variáveis de ambiente Vite (.env).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const USER_SUPABASE_URL = (import.meta.env.VITE_EXTERNAL_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL) as string;
export const USER_SUPABASE_PUBLISHABLE_KEY = (import.meta.env.VITE_EXTERNAL_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

if (!USER_SUPABASE_URL || !USER_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    '[supabase] VITE_EXTERNAL_SUPABASE_URL e VITE_EXTERNAL_SUPABASE_ANON_KEY são obrigatórios no .env',
  );
}

export const supabase = createClient<Database>(USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
