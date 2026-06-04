// Cliente Supabase apontando para o projeto do usuário (NÃO Lovable Cloud).
// Lê credenciais EXCLUSIVAMENTE de variáveis de ambiente Vite (.env).
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    '[supabase] VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórios no .env',
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
