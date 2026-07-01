/**
 * Fase 7 — cache compartilhado (TanStack Query) para usePaymentMethods.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { paymentMethodsQueryKey } from "../usePaymentMethods";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("usePaymentMethods — cache compartilhado (Fase 7)", () => {
  let client: QueryClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    fetchSpy = vi.fn().mockResolvedValue([
      { id: "pm1", name: "Pix", icon: null, active: true, sortOrder: 1, kind: "account" },
    ]);
  });

  it("consumidores múltiplos com mesma queryKey disparam apenas 1 fetch", async () => {
    const key = paymentMethodsQueryKey("owner-1");
    const wrapper = wrapperFactory(client);

    const h1 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toBeDefined();
      expect(h2.result.current.data).toBeDefined();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidateQueries força um novo fetch", async () => {
    const key = paymentMethodsQueryKey("owner-2");
    const wrapper = wrapperFactory(client);
    const h = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => expect(h.result.current.data).toBeDefined());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await client.invalidateQueries({ queryKey: key });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });

  it("queryKey é estável e determinística por owner", () => {
    expect(paymentMethodsQueryKey("owner-a")).toEqual(["payment-methods", "owner-a"]);
    expect(paymentMethodsQueryKey(null)).toEqual(["payment-methods", "anon"]);
    expect(paymentMethodsQueryKey(undefined)).toEqual(["payment-methods", "anon"]);
  });
});
