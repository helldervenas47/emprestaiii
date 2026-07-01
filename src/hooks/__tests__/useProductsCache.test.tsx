/**
 * Fase 6 — cache compartilhado (TanStack Query) para useProducts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { productsQueryKey, salesQueryKey } from "../useProducts";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("useProducts — cache compartilhado (Fase 6)", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
  });

  it("productsQueryKey: múltiplos consumidores disparam apenas 1 fetch", async () => {
    const key = productsQueryKey("owner-1");
    const fetchSpy = vi.fn().mockResolvedValue([{ id: "p1" }]);
    const wrapper = wrapperFactory(client);

    const h1 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toEqual([{ id: "p1" }]);
      expect(h2.result.current.data).toEqual([{ id: "p1" }]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("salesQueryKey: múltiplos consumidores disparam apenas 1 fetch", async () => {
    const key = salesQueryKey("owner-1");
    const fetchSpy = vi.fn().mockResolvedValue({ sales: [{ id: "s1" }], productNameMap: {} });
    const wrapper = wrapperFactory(client);

    const h1 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toBeDefined();
      expect(h2.result.current.data).toBeDefined();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidateQueries força refetch em products e sales", async () => {
    const wrapper = wrapperFactory(client);
    const pKey = productsQueryKey("owner-2");
    const sKey = salesQueryKey("owner-2");
    const pSpy = vi.fn().mockResolvedValue([]);
    const sSpy = vi.fn().mockResolvedValue({ sales: [], productNameMap: {} });

    const h1 = renderHook(() => useQuery({ queryKey: pKey, queryFn: pSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: sKey, queryFn: sSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toBeDefined();
      expect(h2.result.current.data).toBeDefined();
    });
    expect(pSpy).toHaveBeenCalledTimes(1);
    expect(sSpy).toHaveBeenCalledTimes(1);

    await client.invalidateQueries({ queryKey: pKey });
    await client.invalidateQueries({ queryKey: sKey });
    await waitFor(() => {
      expect(pSpy).toHaveBeenCalledTimes(2);
      expect(sSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("queryKeys estáveis e determinísticas por owner", () => {
    expect(productsQueryKey("owner-a")).toEqual(["products", "owner-a"]);
    expect(salesQueryKey("owner-a")).toEqual(["sales", "owner-a"]);
    expect(productsQueryKey(null)).toEqual(["products", "anon"]);
    expect(salesQueryKey(undefined)).toEqual(["sales", "anon"]);
  });
});
