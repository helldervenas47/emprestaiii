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

export type ExpirationAction = "block_all" | "readonly" | "force_upgrade";

interface PlanLite {
  id: string;
  name: string;
  trial_days: number;
  limits: PlanLimits;
  permissions: PlanPermissions;
  allowed_tabs: string[] | null;
  expiration_action: ExpirationAction;
}

/**
 * Resolve o plano efetivo do usuário e expõe limites/permissões.
 *
 * Ordem de resolução:
 *  1. Assinatura ativa (`subscriptions.product_id` ⇄ `plans.name`).
 *  2. `profiles.trial_plan_name` (plano escolhido no cadastro).
 *  3. Primeiro plano ativo (fallback — costuma ser o "Teste Gratuito").
 */
export function usePlanEntitlements() {
  const { user, dataOwnerId, loading: authLoading } = useAuth();
  const { subscription, isActive } = useSubscription();
  const [plan, setPlan] = useState<PlanLite | null>(null);
  const [loading, setLoading] = useState(true);
  const [trialStartedAt, setTrialStartedAt] = useState<Date | null>(null);
  const effectiveUserId = dataOwnerId ?? user?.id ?? null;

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);

      if (authLoading) return;

      const [{ data: allPlans }, profileRes] = await Promise.all([
        (supabase as any)
          .from("plans")
          .select("id,name,trial_days,limits,permissions,allowed_tabs,expiration_action,active,sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        effectiveUserId
          ? (supabase as any)
              .from("profiles")
              .select("created_at,trial_plan_name,trial_started_at")
              .eq("user_id", effectiveUserId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const list: any[] = allPlans ?? [];
      const prof: any = profileRes?.data ?? null;
      let picked: any | null = null;

      if (subscription?.product_id) {
        picked = list.find(
          (p) => (p.name || "").toLowerCase() === subscription.product_id.toLowerCase()
        );
      }
      if (!picked && prof?.trial_plan_name) {
        picked = list.find(
          (p) => (p.name || "").toLowerCase() === String(prof.trial_plan_name).toLowerCase()
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
                expiration_action: (picked.expiration_action ?? "force_upgrade") as ExpirationAction,
              }
            : null
        );
        const ts = prof?.trial_started_at || prof?.created_at || user?.created_at;
        setTrialStartedAt(ts ? new Date(ts) : null);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
    }, [effectiveUserId, user?.created_at, subscription?.product_id, authLoading]);

  const trial = useMemo(() => {
    const days = plan?.trial_days ?? 0;
    const action = plan?.expiration_action ?? "force_upgrade";
    if (!days || !trialStartedAt) {
      return {
        active: false,
        daysLeft: 0,
        hoursLeft: 0,
        msLeft: 0,
        endsAt: null as Date | null,
        expired: false,
        expirationAction: action,
      };
    }
    const endsAt = new Date(trialStartedAt.getTime() + days * 86400_000);
    const msLeft = endsAt.getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400_000));
    const hoursLeft = Math.max(0, Math.ceil(msLeft / 3600_000));
    const expired = msLeft <= 0 && !isActive;
    return {
      active: !isActive && msLeft > 0,
      daysLeft,
      hoursLeft,
      msLeft: Math.max(0, msLeft),
      endsAt,
      expired,
      expirationAction: action,
    };
  }, [plan, trialStartedAt, isActive]);

  // Em modo readonly após expiração, qualquer ação fica bloqueada.
  const lockdown = trial.expired && trial.expirationAction === "readonly";

  const can = (action: string) => {
    if (lockdown) return false;
    return isPermitted(plan?.permissions, action);
  };
  const withinLimit = (key: LimitKey, current: number) => {
    if (lockdown) return false;
    return isWithinLimit(plan?.limits, key, current);
  };

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
