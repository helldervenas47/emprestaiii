/**
 * Cache compartilhado para useSubscription — evita loop de requests em `subscriptions`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { subscriptionQueryKey } from "../useSubscription";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("useSubscription — cache compartilhado", () => {
  let client: QueryClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
    fetchSpy = vi.fn().mockResolvedValue({ id: "sub-1", product_id: "basico_plan" });
  });

  it("duas instâncias com mesma queryKey fazem apenas 1 fetch de subscriptions", async () => {
    const key = subscriptionQueryKey("owner-1");
    const wrapper = wrapperFactory(client);

    const h1 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toBeDefined();
      expect(h2.result.current.data).toBeDefined();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("queryKey é estável e determinística por effectiveUserId", () => {
    expect(subscriptionQueryKey("u1")).toEqual(["subscription", "u1"]);
    expect(subscriptionQueryKey(null)).toEqual(["subscription", null]);
  });
});
