/**
 * Fase pós-Fase 8 — Suporte a filtro por período em useExpenses.
 * Valida que a queryKey muda por período, que o cache não mistura períodos
 * distintos e que o comportamento sem período permanece idêntico.
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

describe("useExpenses — período opcional", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
  });

  it("queryKey sem período mantém formato antigo (2-tuple)", () => {
    expect(expensesQueryKey("owner-a")).toEqual(["expenses", "owner-a"]);
    expect(expensesQueryKey(null)).toEqual(["expenses", "anon"]);
  });

  it("queryKey com período inclui start, end e limit", () => {
    expect(
      expensesQueryKey("owner-a", { startDate: "2026-06-01", endDate: "2026-06-30" }),
    ).toEqual(["expenses", "owner-a", "2026-06-01", "2026-06-30", null]);
    expect(expensesQueryKey("owner-a", { limit: 100 })).toEqual([
      "expenses", "owner-a", null, null, 100,
    ]);
  });

  it("cache não mistura períodos diferentes (2 fetches para 2 keys)", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce([{ id: "june" }])
      .mockResolvedValueOnce([{ id: "july" }]);
    const wrapper = wrapperFactory(client);

    const k1 = expensesQueryKey("owner-1", { startDate: "2026-06-01", endDate: "2026-06-30" });
    const k2 = expensesQueryKey("owner-1", { startDate: "2026-07-01", endDate: "2026-07-31" });

    const h1 = renderHook(() => useQuery({ queryKey: k1, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: k2, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toEqual([{ id: "june" }]);
      expect(h2.result.current.data).toEqual([{ id: "july" }]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidação por prefixo do owner atinge todos os períodos", async () => {
    const fetchSpy = vi.fn().mockResolvedValue([{ id: "x" }]);
    const wrapper = wrapperFactory(client);
    const k1 = expensesQueryKey("owner-2", { startDate: "2026-06-01" });
    const k2 = expensesQueryKey("owner-2", { startDate: "2026-07-01" });

    renderHook(() => useQuery({ queryKey: k1, queryFn: fetchSpy }), { wrapper });
    renderHook(() => useQuery({ queryKey: k2, queryFn: fetchSpy }), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    await client.invalidateQueries({ queryKey: expensesQueryKey("owner-2") });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4));
  });
});
