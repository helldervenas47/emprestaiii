import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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

interface ProfilePlanFields {
  created_at?: string | null;
  trial_plan_name?: string | null;
  trial_started_at?: string | null;
}

type PlanEntitlementRow = PlanLite & {
  active?: boolean | null;
  sort_order?: number | null;
};

interface EntitlementsData {
  plan: PlanLite | null;
  trialStartedAt: Date | null;
}

export const planEntitlementsQueryKey = (
  userId: string | null,
  subscriptionProductId: string | null,
) => ["plan-entitlements", userId, subscriptionProductId ?? "free"] as const;

export function usePlanEntitlements() {
  const { user, dataOwnerId, loading: authLoading } = useAuth();
  const { subscription, isActive, loading: subscriptionLoading } = useSubscription();
  const effectiveUserId = dataOwnerId ?? user?.id ?? null;
  const subscriptionProductId = subscription?.product_id ?? null;

  const { data, isLoading } = useQuery<EntitlementsData>({
    queryKey: planEntitlementsQueryKey(effectiveUserId, subscriptionProductId),
    enabled: !authLoading && !subscriptionLoading && !!effectiveUserId,
    queryFn: async () => {
      const [{ data: allPlans }, profileRes] = await Promise.all([
        supabase
          .from("plans")
          .select("id, name, trial_days, limits, permissions, allowed_tabs, expiration_action, active, sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
        supabase
          .from("profiles")
          .select("created_at, trial_plan_name, trial_started_at")
          .eq("user_id", effectiveUserId as string)
          .maybeSingle(),
      ]);

      const list = (allPlans ?? []) as unknown as PlanEntitlementRow[];
      const prof = (profileRes?.data ?? null) as ProfilePlanFields | null;
      let picked: PlanEntitlementRow | null = null;

      if (subscriptionProductId) {
        picked = list.find((p) => (p.name || "").toLowerCase() === subscriptionProductId.toLowerCase()) ?? null;
      }
      if (!picked && prof?.trial_plan_name) {
        picked = list.find((p) => (p.name || "").toLowerCase() === String(prof.trial_plan_name).toLowerCase()) ?? null;
      }
      if (!picked) {
        picked = list[0] ?? null;
      }

      const plan: PlanLite | null = picked
        ? {
            id: picked.id,
            name: picked.name,
            trial_days: picked.trial_days ?? 0,
            limits: picked.limits ?? {},
            permissions: picked.permissions ?? {},
            allowed_tabs: picked.allowed_tabs ?? null,
            expiration_action: (picked.expiration_action ?? "force_upgrade") as ExpirationAction,
          }
        : null;

      const ts = prof?.trial_started_at || prof?.created_at || user?.created_at;
      return { plan, trialStartedAt: ts ? new Date(ts) : null };
    },
  });

  const plan = data?.plan ?? null;
  const trialStartedAt = data?.trialStartedAt ?? null;
  const loading = authLoading || subscriptionLoading || (!!effectiveUserId && isLoading);

  const trial = useMemo(() => {
    const days = plan?.trial_days ?? 0;
    const action = plan?.expiration_action ?? "force_upgrade";
    if (!days || !trialStartedAt || loading) {
      return { active: false, daysLeft: 0, hoursLeft: 0, msLeft: 0, endsAt: null as Date | null, expired: false, expirationAction: action };
    }
    const endsAt = new Date(trialStartedAt.getTime() + days * 86400_000);
    const msLeft = endsAt.getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(msLeft / 86400_000));
    const hoursLeft = Math.max(0, Math.ceil(msLeft / 3600_000));
    const expired = msLeft <= 0 && !isActive;
    return { active: !isActive && msLeft > 0, daysLeft, hoursLeft, msLeft: Math.max(0, msLeft), endsAt, expired, expirationAction: action };
  }, [plan, trialStartedAt, isActive, loading]);

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
    plan, limits: plan?.limits ?? {}, permissions: plan?.permissions ?? {},
    allowedTabs: plan?.allowed_tabs ?? null, trial, can, withinLimit,
    isPaid: isActive, allKnownPermissions: ALL_PERMISSION_KEYS,
  };
}
