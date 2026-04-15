import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;

const createSubscriptionChannelName = (userId: string) =>
  `sub-${userId}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export interface Subscription {
  id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
}

// Map product IDs to plan tiers (higher = more features)
const PLAN_TIERS: Record<string, number> = {
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

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const environment = clientToken?.startsWith("test_") ? "sandbox" : "live";

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchSubscription = async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .eq("environment", environment)
        .maybeSingle();

      if (!cancelled) {
        setSubscription(data);
        setLoading(false);
      }
    };

    fetchSubscription();

    const channelName = createSubscriptionChannelName(user.id);
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          if (!cancelled) fetchSubscription();
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, environment]);

  const isActive = Boolean(
    subscription &&
    ["active", "trialing"].includes(subscription.status) &&
    (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())
  );

  const planTier = subscription ? (PLAN_TIERS[subscription.product_id] || 0) : 0;
  const planLimits = subscription ? PLAN_LIMITS[subscription.product_id] : null;

  const hasFeature = (requiredTier: number) => isActive && planTier >= requiredTier;

  return {
    subscription,
    loading,
    isActive,
    planTier,
    planLimits,
    hasFeature,
    environment,
  };
}
