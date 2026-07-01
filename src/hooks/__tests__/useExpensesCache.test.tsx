/**
 * Fase 4 — cache compartilhado (TanStack Query) para useExpenses.
 * Cobre o contrato mínimo:
 *   1. Múltiplos consumidores com a mesma queryKey compartilham 1 fetch.
 *   2. invalidateQueries força refetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { expensesQueryKey } from "../useExpenses";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("useExpenses — cache compartilhado (Fase 4)", () => {
  let client: QueryClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    fetchSpy = vi.fn().mockResolvedValue([{ id: "e1" }]);
  });

  it("consumidores múltiplos com mesma queryKey disparam apenas 1 fetch", async () => {
    const key = expensesQueryKey("owner-1");
    const wrapper = wrapperFactory(client);

    const h1 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toEqual([{ id: "e1" }]);
      expect(h2.result.current.data).toEqual([{ id: "e1" }]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidateQueries força um novo fetch", async () => {
    const key = expensesQueryKey("owner-2");
    const wrapper = wrapperFactory(client);
    const h = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => expect(h.result.current.data).toBeDefined());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await client.invalidateQueries({ queryKey: key });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });

  it("queryKey é estável e determinística por owner", () => {
    expect(expensesQueryKey("owner-a")).toEqual(["expenses", "owner-a"]);
    expect(expensesQueryKey(null)).toEqual(["expenses", "anon"]);
    expect(expensesQueryKey(undefined)).toEqual(["expenses", "anon"]);
  });
});
