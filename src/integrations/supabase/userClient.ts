import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const USER_SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "") as string;
export const USER_SUPABASE_PUBLISHABLE_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
) as string;

export const MISSING_SUPABASE_ENV: string[] = [
  !USER_SUPABASE_URL && "VITE_SUPABASE_URL",
  !USER_SUPABASE_PUBLISHABLE_KEY && "VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY)",
].filter(Boolean) as string[];

export const IS_SUPABASE_CONFIGURED = MISSING_SUPABASE_ENV.length === 0;

if (!IS_SUPABASE_CONFIGURED && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] Variáveis de ambiente ausentes:",
    MISSING_SUPABASE_ENV.join(", "),
    "\nDefina-as no .env (veja .env.example).",
  );
}

// Mantém compatibilidade com as sessões criadas pela versão importada.
export const USER_SUPABASE_STORAGE_KEY = "sb-user-external-auth";

// Se as variáveis estiverem ausentes, exportamos um placeholder inerte para
// evitar que o import quebre o bundle. O `main.tsx` intercepta esse estado
// e renderiza uma tela de erro amigável antes de qualquer uso do client.
export const supabase = IS_SUPABASE_CONFIGURED
  ? createClient<Database>(USER_SUPABASE_URL, USER_SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: localStorage,
        storageKey: USER_SUPABASE_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        // PWA-friendly OAuth: usa PKCE (sem expor token na URL) e troca o
        // ?code=... automaticamente no retorno do Google, sem reload extra.
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    })
  : (new Proxy(
      {},
      {
        get() {
          throw new Error(
            `[supabase] Client não inicializado. Variáveis ausentes: ${MISSING_SUPABASE_ENV.join(", ")}`,
          );
        },
      },
    ) as ReturnType<typeof createClient<Database>>);
