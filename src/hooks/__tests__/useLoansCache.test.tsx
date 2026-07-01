/**
 * Fase 3 — cache compartilhado (TanStack Query) para useLoans.
 *
 * Estes testes NÃO montam o `useLoans` inteiro (que tem dependências pesadas:
 * auth, offline, ledger, balance…). Eles cobrem o contrato mínimo da nova
 * camada de cache:
 *   1. Múltiplos consumidores com a mesma queryKey compartilham um único fetch.
 *   2. `invalidateQueries` força um refetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { loansQueryKey } from "../useLoans";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("useLoans — cache compartilhado (Fase 3)", () => {
  let client: QueryClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    fetchSpy = vi.fn().mockResolvedValue([{ id: "l1" }]);
  });

  it("consumidores múltiplos com mesma queryKey disparam apenas 1 fetch", async () => {
    const key = loansQueryKey("owner-1");
    const wrapper = wrapperFactory(client);

    const h1 = renderHook(
      () => useQuery({ queryKey: key, queryFn: fetchSpy }),
      { wrapper },
    );
    const h2 = renderHook(
      () => useQuery({ queryKey: key, queryFn: fetchSpy }),
      { wrapper },
    );

    await waitFor(() => {
      expect(h1.result.current.data).toEqual([{ id: "l1" }]);
      expect(h2.result.current.data).toEqual([{ id: "l1" }]);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("invalidateQueries força um novo fetch (padrão usado pelo realtime e mutações)", async () => {
    const key = loansQueryKey("owner-2");
    const wrapper = wrapperFactory(client);

    const h = renderHook(
      () => useQuery({ queryKey: key, queryFn: fetchSpy }),
      { wrapper },
    );
    await waitFor(() => expect(h.result.current.data).toBeDefined());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await client.invalidateQueries({ queryKey: key });

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
  });

  it("queryKey é estável e determinística por owner", () => {
    expect(loansQueryKey("owner-a")).toEqual(["loans", "owner-a"]);
    expect(loansQueryKey(null)).toEqual(["loans", "anon"]);
    expect(loansQueryKey(undefined)).toEqual(["loans", "anon"]);
  });
});
