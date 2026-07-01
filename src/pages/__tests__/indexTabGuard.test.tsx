import React, { useEffect, useMemo, useState } from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

/**
 * Testa a lógica do "tab guard" usado em src/pages/Index.tsx:
 * - não deve chamar setTab em loop quando `visibleTabs` muda de referência
 *   mas os ids continuam iguais;
 * - deve chamar setTab apenas quando a aba atual não está no tabConfig.
 */

type Tab = string;
const tabConfig: { id: Tab }[] = [
  { id: "dashboard" },
  { id: "overview" },
  { id: "help" },
];

function Harness({
  visibleTabs,
  initialTab,
  onSetTab,
  loading = false,
}: {
  visibleTabs: { id: Tab }[];
  initialTab: Tab;
  onSetTab: (t: Tab) => void;
  loading?: boolean;
}) {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const visibleTabIds = useMemo(() => visibleTabs.map((t) => t.id), [visibleTabs]);
  const visibleTabsSignature = useMemo(() => visibleTabIds.join("|"), [visibleTabIds]);

  const setTab = (t: Tab) => {
    onSetTab(t);
    setTabState(t);
  };

  useEffect(() => {
    if (loading) return;
    if (visibleTabs.length === 0) return;
    if (tabConfig.some((item) => item.id === tab)) return;
    const next = visibleTabs[0].id;
    if (next === tab) return;
    setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, visibleTabsSignature, loading]);

  return <div data-testid="tab">{tab}</div>;
}

describe("Index tab guard", () => {
  it("não chama setTab em loop quando visibleTabs muda de referência mas ids iguais", () => {
    const onSetTab = vi.fn();
    const initial = [{ id: "dashboard" }, { id: "overview" }];
    const { rerender } = render(
      <Harness visibleTabs={initial} initialTab="dashboard" onSetTab={onSetTab} />,
    );
    // Nova referência, mesmos ids
    for (let i = 0; i < 5; i++) {
      rerender(
        <Harness
          visibleTabs={[{ id: "dashboard" }, { id: "overview" }]}
          initialTab="dashboard"
          onSetTab={onSetTab}
        />,
      );
    }
    expect(onSetTab).not.toHaveBeenCalled();
  });

  it("muda para primeira aba visível apenas quando a aba atual não existe no tabConfig", async () => {
    const onSetTab = vi.fn();
    render(
      <Harness
        visibleTabs={[{ id: "overview" }, { id: "help" }]}
        initialTab={"nonexistent" as Tab}
        onSetTab={onSetTab}
      />,
    );
    await act(async () => {});
    expect(onSetTab).toHaveBeenCalledTimes(1);
    expect(onSetTab).toHaveBeenCalledWith("overview");
  });

  it("não muda de aba quando a aba atual existe no tabConfig, mesmo sem permissão (acesso negado)", async () => {
    const onSetTab = vi.fn();
    render(
      <Harness
        visibleTabs={[{ id: "overview" }]}
        initialTab="dashboard"
        onSetTab={onSetTab}
      />,
    );
    await act(async () => {});
    expect(onSetTab).not.toHaveBeenCalled();
  });

  it("não redireciona enquanto loading é true", async () => {
    const onSetTab = vi.fn();
    render(
      <Harness
        visibleTabs={[{ id: "overview" }]}
        initialTab={"nonexistent" as Tab}
        onSetTab={onSetTab}
        loading
      />,
    );
    await act(async () => {});
    expect(onSetTab).not.toHaveBeenCalled();
  });
});
