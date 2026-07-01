/**
 * Fase — carregamento sob demanda por aba.
 *
 * Verifica o contrato do parâmetro `enabled` usado por Index.tsx para gatear
 * `useLoans` (e semelhantes) quando a aba ativa não precisa do dado. Não
 * montamos o hook completo (auth/offline/ledger); testamos o comportamento
 * do `useQuery` sob a mesma queryKey + flag `enabled`, que é exatamente o
 * mecanismo aplicado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { loansQueryKey } from "../useLoans";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("useLoans — enabled/tab gating", () => {
  let client: QueryClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    fetchSpy = vi.fn().mockResolvedValue([{ id: "l1" }]);
  });

  it("aba inativa (enabled=false) não dispara fetch", async () => {
    const key = loansQueryKey("owner-1");
    const wrapper = wrapperFactory(client);

    renderHook(
      () => useQuery({ queryKey: key, queryFn: fetchSpy, enabled: false }),
      { wrapper },
    );

    // pequena espera para garantir que nenhum microtask disparou o fetch
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ao ativar a aba (enabled=true), o fetch dispara", async () => {
    const key = loansQueryKey("owner-2");
    const wrapper = wrapperFactory(client);

    const { rerender, result } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useQuery({ queryKey: key, queryFn: fetchSpy, enabled }),
      { wrapper, initialProps: { enabled: false } },
    );

    expect(fetchSpy).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.data).toEqual([{ id: "l1" }]));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("voltar para a aba já carregada reaproveita o cache (sem novo fetch)", async () => {
    const key = loansQueryKey("owner-3");
    const wrapper = wrapperFactory(client);

    // Primeira montagem: carrega
    const h1 = renderHook(
      () => useQuery({ queryKey: key, queryFn: fetchSpy, enabled: true }),
      { wrapper },
    );
    await waitFor(() => expect(h1.result.current.data).toBeDefined());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Simula trocar de aba (desmonta) e voltar (nova montagem, mesma key)
    h1.unmount();
    const h2 = renderHook(
      () => useQuery({ queryKey: key, queryFn: fetchSpy, enabled: true }),
      { wrapper },
    );

    await waitFor(() => expect(h2.result.current.data).toEqual([{ id: "l1" }]));
    // staleTime=30s ⇒ cache reaproveitado, sem novo fetch
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
