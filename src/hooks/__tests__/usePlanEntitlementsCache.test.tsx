/**
 * Cache compartilhado para usePlanEntitlements — evita cascata em `plans`/`profiles`
 * quando `subscription.product_id` chega depois do primeiro fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { planEntitlementsQueryKey } from "../usePlanEntitlements";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("usePlanEntitlements — cache compartilhado", () => {
  let client: QueryClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    fetchSpy = vi.fn().mockResolvedValue({ plan: { id: "p1" }, trialStartedAt: null });
  });

  it("duas instâncias com a mesma queryKey fazem apenas 1 fetch de plans/profiles", async () => {
    const key = planEntitlementsQueryKey("owner-1", "basico_plan");
    const wrapper = wrapperFactory(client);

    const h1 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toBeDefined();
      expect(h2.result.current.data).toBeDefined();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("mudança de subscriptionProductId refaz uma vez e estabiliza", async () => {
    const wrapper = wrapperFactory(client);

    const { result, rerender } = renderHook(
      ({ productId }: { productId: string | null }) =>
        useQuery({
          queryKey: planEntitlementsQueryKey("owner-1", productId),
          queryFn: fetchSpy,
        }),
      { wrapper, initialProps: { productId: null as string | null } },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    rerender({ productId: "basico_plan" });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    // Rerenders posteriores com a mesma key não devem refetchar.
    rerender({ productId: "basico_plan" });
    rerender({ productId: "basico_plan" });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("queryKey usa 'free' como fallback quando não há productId", () => {
    expect(planEntitlementsQueryKey("u1", null)).toEqual(["plan-entitlements", "u1", "free"]);
    expect(planEntitlementsQueryKey("u1", "basico_plan")).toEqual([
      "plan-entitlements",
      "u1",
      "basico_plan",
    ]);
  });
});
