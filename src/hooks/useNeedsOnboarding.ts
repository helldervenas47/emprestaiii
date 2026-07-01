// Detecta se o usuário atual ainda não passou pelo onboarding.
// Heurística: 0 categorias pessoais E flag local não setada.
// É barato (uma query count) e roda só uma vez por sessão.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

const LS_KEY = (uid: string) => `emprestai-onboarded-${uid}`;
const ONBOARDING_TIMEOUT_MS = 6000;

export function useNeedsOnboarding(): { loading: boolean; needs: boolean } {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState(false);

  const userId = user?.id;
  const userCreatedAt = user?.created_at;

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setLoading(false);
      setNeeds(false);
      return;
    }
    // Fast path: flag local
    try {
      if (localStorage.getItem(LS_KEY(userId))) {
        setNeeds(false);
        setLoading(false);
        return;
      }
    } catch { /* noop */ }

    // Usuários já existentes (conta criada há mais de 5 minutos) não passam pela tela de boas-vindas.
    const createdAt = userCreatedAt ? new Date(userCreatedAt).getTime() : 0;
    const isRecentlyCreated = createdAt > 0 && (Date.now() - createdAt) < 5 * 60 * 1000;
    if (!isRecentlyCreated) {
      try { localStorage.setItem(LS_KEY(userId), "1"); } catch { /* noop */ }
      setNeeds(false);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const query = supabase
          .from("personal_expense_categories")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);

        const timeout = new Promise<{ count: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ count: null, error: new Error("timeout") }), ONBOARDING_TIMEOUT_MS),
        );

        const { count, error } = (await Promise.race([query, timeout])) as { count: number | null; error: unknown };

        if (cancelled) return;
        if (error) {
          setNeeds(false);
          return;
        }
        const isNew = (count ?? 0) === 0;
        if (!isNew) {
          try { localStorage.setItem(LS_KEY(userId), "1"); } catch { /* noop */ }
        }
        setNeeds(isNew);
      } catch {
        if (!cancelled) setNeeds(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, userCreatedAt]);

  return { loading, needs };
}
