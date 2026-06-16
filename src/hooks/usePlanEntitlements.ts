import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import {
  ALL_PERMISSION_KEYS,
  isPermitted,
  isWithinLimit,
  LimitKey,
  PlanLimits,
  PlanPermissions,
} from "@/lib/planEntitlements";

interface PlanLite {
  id: string;
  name: string;
  trial_days: number;
  limits: PlanLimits;
  permissions: PlanPermissions;
  allowed_tabs: string[] | null;
}

/**
 * Resolve o plano efetivo do usuário e expõe limites/permissões.
 * Heurística para descobrir o plano:
 *  1. Procura em `plans` cujo nome (case insensitive) bate com `subscriptions.product_id`.
 *  2. Se não houver assinatura ativa, usa o plano com menor `sort_order` marcado como `active`
 *     (geralmente o "Teste Gratuito").
 */
export function usePlanEntitlements() {
  const { user } = useAuth();
  const { subscription, isActive } = useSubscription();
  const [plan, setPlan] = useState<PlanLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [trialStartedAt, setTrialStartedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data: allPlans } = await (supabase as any)
        .from("plans")
        .select("id,name,trial_days,limits,permissions,allowed_tabs,active,sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });

      const list: any[] = allPlans ?? [];
      let picked: any | null = null;

      if (subscription?.product_id) {
        picked = list.find(
          (p) => (p.name || "").toLowerCase() === subscription.product_id.toLowerCase()
        );
      }
      if (!picked) picked = list[0] ?? null;

      if (!cancel) {
        setPlan(
          picked
            ? {
                id: picked.id,
                name: picked.name,
                trial_days: picked.trial_days ?? 0,
                limits: picked.limits ?? {},
                permissions: picked.permissions ?? {},
                allowed_tabs: picked.allowed_tabs ?? null,
              }
            : null
        );
        setLoading(false);
      }

      // Trial start = subscription.created_at OU profile.created_at OU user.created_at
      if (user) {
        const { data: prof } = await (supabase as any)
          .from("profiles")
          .select("created_at")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!cancel) {
          const ts = prof?.created_at || user.created_at;
          setTrialStartedAt(ts ? new Date(ts) : null);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user, subscription?.product_id]);

  const trial = useMemo(() => {
    const days = plan?.trial_days ?? 0;
    if (!days || !trialStartedAt) {
      return { active: false, daysLeft: 0, endsAt: null as Date | null, expired: false };
    }
    const endsAt = new Date(trialStartedAt.getTime() + days * 86400_000);
    const msLeft = endsAt.getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400_000));
    const expired = msLeft <= 0 && !isActive;
    return { active: !isActive && msLeft > 0, daysLeft, endsAt, expired };
  }, [plan, trialStartedAt, isActive]);

  const can = (action: string) => isPermitted(plan?.permissions, action);
  const withinLimit = (key: LimitKey, current: number) =>
    isWithinLimit(plan?.limits, key, current);

  return {
    loading,
    plan,
    limits: plan?.limits ?? {},
    permissions: plan?.permissions ?? {},
    allowedTabs: plan?.allowed_tabs ?? null,
    trial,
    can,
    withinLimit,
    isPaid: isActive,
    allKnownPermissions: ALL_PERMISSION_KEYS,
  };
}
