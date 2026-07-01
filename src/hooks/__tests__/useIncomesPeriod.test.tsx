/**
 * Fase pós-Fase 8 — Suporte a filtro por período em useIncomes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { incomesQueryKey } from "../useIncomes";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("useIncomes — período opcional", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
  });

  it("queryKey sem período mantém formato antigo (2-tuple)", () => {
    expect(incomesQueryKey("owner-a")).toEqual(["incomes", "owner-a"]);
    expect(incomesQueryKey(null)).toEqual(["incomes", "anon"]);
  });

  it("queryKey com período inclui start, end e limit", () => {
    expect(
      incomesQueryKey("owner-a", { startDate: "2026-06-01", endDate: "2026-06-30" }),
    ).toEqual(["incomes", "owner-a", "2026-06-01", "2026-06-30", null]);
    expect(incomesQueryKey("owner-a", { limit: 100 })).toEqual([
      "incomes", "owner-a", null, null, 100,
    ]);
  });

  it("cache não mistura períodos diferentes", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce([{ id: "jan" }])
      .mockResolvedValueOnce([{ id: "feb" }]);
    const wrapper = wrapperFactory(client);
    const k1 = incomesQueryKey("owner-1", { startDate: "2026-01-01", endDate: "2026-01-31" });
    const k2 = incomesQueryKey("owner-1", { startDate: "2026-02-01", endDate: "2026-02-28" });

    const h1 = renderHook(() => useQuery({ queryKey: k1, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: k2, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toEqual([{ id: "jan" }]);
      expect(h2.result.current.data).toEqual([{ id: "feb" }]);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("invalidação por prefixo do owner atinge todos os períodos", async () => {
    const fetchSpy = vi.fn().mockResolvedValue([{ id: "x" }]);
    const wrapper = wrapperFactory(client);
    const k1 = incomesQueryKey("owner-2", { startDate: "2026-01-01" });
    const k2 = incomesQueryKey("owner-2", { startDate: "2026-02-01" });

    renderHook(() => useQuery({ queryKey: k1, queryFn: fetchSpy }), { wrapper });
    renderHook(() => useQuery({ queryKey: k2, queryFn: fetchSpy }), { wrapper });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));

    await client.invalidateQueries({ queryKey: incomesQueryKey("owner-2") });
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4));
  });
});
