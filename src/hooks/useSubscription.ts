import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export const subscriptionQueryKey = (userId: string | null) =>
  ["subscription", userId] as const;

export function useSubscription() {
  const { user, dataOwnerId, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const environment = import.meta.env.VITE_ASAAS_ENVIRONMENT === "production" ? "live" : "sandbox";
  const effectiveUserId = dataOwnerId ?? user?.id ?? null;

  const { data: subscription = null, isLoading } = useQuery({
    queryKey: subscriptionQueryKey(effectiveUserId),
    enabled: !authLoading && !!effectiveUserId,
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id, product_id, price_id, status, current_period_end, cancel_at_period_end, environment")
        .eq("user_id", effectiveUserId as string)
        .eq("environment", environment)
        .maybeSingle();
      return (data ?? null) as Subscription | null;
    },
  });

  // Deterministic realtime channel; invalidates only the matching query.
  useEffect(() => {
    if (!effectiveUserId) return;
    const channel = supabase
      .channel(`subscription-${effectiveUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${effectiveUserId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: subscriptionQueryKey(effectiveUserId) });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveUserId, queryClient]);

  const loading = authLoading || (!!effectiveUserId && isLoading);

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
