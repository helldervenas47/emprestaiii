import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

export interface Subscription {
  id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
  asaas_subscription_id?: string | null;
}

export const PLAN_TIERS: Record<string, number> = {
  free_plan: 0,
  basico_plan: 1,
  profissional_plan: 2,
  empresarial_plan: 3,
};

const PLAN_LIMITS: Record<string, { maxLoans: number; maxUsers: number }> = {
  basico_plan: { maxLoans: 50, maxUsers: 1 },
  profissional_plan: { maxLoans: 200, maxUsers: 3 },
  empresarial_plan: { maxLoans: 9999, maxUsers: 5 },
};

const createChannelName = (userId: string) =>
  `sub-${userId}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export function useSubscription() {
  const { user, dataOwnerId, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const environment = import.meta.env.VITE_ASAAS_ENVIRONMENT === "production" ? "live" : "sandbox";
  const effectiveUserId = dataOwnerId ?? user?.id ?? null;

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!effectiveUserId) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchSubscription = async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, product_id, price_id, status, current_period_end, cancel_at_period_end, environment")
        .eq("user_id", effectiveUserId)
        .eq("environment", environment)
        .maybeSingle();
      if (!cancelled) {
        setSubscription(data);
        setLoading(false);
      }
    };

    fetchSubscription();

    // Realtime removido (P0-02 egress): assinatura muda raramente.
    // Refetch em foco e via evento local disparado pelo checkout/webhook client-side.
    const handler = () => { if (!cancelled) fetchSubscription(); };
    window.addEventListener("subscription:changed", handler);
    window.addEventListener("focus", handler);

    return () => {
      cancelled = true;
      window.removeEventListener("subscription:changed", handler);
      window.removeEventListener("focus", handler);
    };
  }, [user?.id, effectiveUserId, environment, authLoading]);

  const isActive = Boolean(
    subscription &&
    ["active", "trialing"].includes(subscription.status) &&
    (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date()),
  );

  const planTier = subscription ? PLAN_TIERS[subscription.product_id] || 0 : 0;
  const planLimits = subscription ? PLAN_LIMITS[subscription.product_id] : null;
  const hasFeature = (requiredTier: number) => isActive && planTier >= requiredTier;

  return { subscription, loading, isActive, planTier, planLimits, hasFeature, environment };
}
