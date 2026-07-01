/**
 * Fase 8 — cache compartilhado (TanStack Query) para usePiggyBanks.
 *
 * Testa apenas o comportamento de cache/invalidation ao redor das query
 * keys exportadas — não depende do hook completo, o que evita ter que
 * mockar toda a arquitetura de cofrinhos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  piggyBanksQueryKey,
  piggyBankLedgerQueryKey,
  piggyBankMarketRateQueryKey,
} from "../usePiggyBanks";

const wrapperFactory = (client: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
};

describe("usePiggyBanks — cache compartilhado (Fase 8)", () => {
  let client: QueryClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
    });
    fetchSpy = vi.fn().mockResolvedValue({ piggyBanks: [], cofrinhoRows: {} });
  });

  it("consumidores múltiplos com a mesma piggyBanksQueryKey disparam apenas 1 fetch", async () => {
    const key = piggyBanksQueryKey("owner-1");
    const wrapper = wrapperFactory(client);

    const h1 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });
    const h2 = renderHook(() => useQuery({ queryKey: key, queryFn: fetchSpy }), { wrapper });

    await waitFor(() => {
      expect(h1.result.current.data).toBeDefined();
      expect(h2.result.current.data).toBeDefined();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("depósito: invalidar piggyBanksQueryKey + piggyBankLedgerQueryKey força refetch de ambas", async () => {
    const pbSpy = vi.fn().mockResolvedValue({ piggyBanks: [], cofrinhoRows: {} });
    const ledgerSpy = vi.fn().mockResolvedValue([]);
    const wrapper = wrapperFactory(client);
    const pbKey = piggyBanksQueryKey("owner-2");
    const ledgerKey = piggyBankLedgerQueryKey("owner-2");

    const hp = renderHook(() => useQuery({ queryKey: pbKey, queryFn: pbSpy }), { wrapper });
    const hl = renderHook(() => useQuery({ queryKey: ledgerKey, queryFn: ledgerSpy }), {
      wrapper,
    });
    await waitFor(() => {
      expect(hp.result.current.data).toBeDefined();
      expect(hl.result.current.data).toBeDefined();
    });
    expect(pbSpy).toHaveBeenCalledTimes(1);
    expect(ledgerSpy).toHaveBeenCalledTimes(1);

    // Simula o que o hook faz após um depósito bem-sucedido
    await Promise.all([
      client.invalidateQueries({ queryKey: pbKey }),
      client.invalidateQueries({ queryKey: ledgerKey }),
    ]);
    await waitFor(() => {
      expect(pbSpy).toHaveBeenCalledTimes(2);
      expect(ledgerSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("resgate: invalidar piggyBanksQueryKey + piggyBankLedgerQueryKey força refetch de ambas", async () => {
    const pbSpy = vi.fn().mockResolvedValue({ piggyBanks: [], cofrinhoRows: {} });
    const ledgerSpy = vi.fn().mockResolvedValue([]);
    const wrapper = wrapperFactory(client);
    const pbKey = piggyBanksQueryKey("owner-3");
    const ledgerKey = piggyBankLedgerQueryKey("owner-3");

    const hp = renderHook(() => useQuery({ queryKey: pbKey, queryFn: pbSpy }), { wrapper });
    const hl = renderHook(() => useQuery({ queryKey: ledgerKey, queryFn: ledgerSpy }), {
      wrapper,
    });
    await waitFor(() => {
      expect(hp.result.current.data).toBeDefined();
      expect(hl.result.current.data).toBeDefined();
    });

    // Simula o que o hook faz após um resgate bem-sucedido
    await Promise.all([
      client.invalidateQueries({ queryKey: pbKey }),
      client.invalidateQueries({ queryKey: ledgerKey }),
    ]);
    await waitFor(() => {
      expect(pbSpy).toHaveBeenCalledTimes(2);
      expect(ledgerSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("query keys são estáveis e determinísticas por owner", () => {
    expect(piggyBanksQueryKey("owner-a")).toEqual(["piggy-banks", "owner-a"]);
    expect(piggyBanksQueryKey(null)).toEqual(["piggy-banks", "anon"]);
    expect(piggyBankLedgerQueryKey("owner-a")).toEqual(["piggy-bank-ledger", "owner-a"]);
    expect(piggyBankMarketRateQueryKey("owner-a")).toEqual(["piggy-bank-market-rate", "owner-a"]);
  });
});
