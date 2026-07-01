/**
 * useUserApproval + useNeedsOnboarding — resiliência ao loop pós-login.
 *
 * Garante que loading libera mesmo com erro/timeout e que a dependência
 * por user.id não re-executa desnecessariamente quando o objeto user
 * muda de referência mas o id permanece.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, waitFor, act } from "@testing-library/react";

const authState: { user: { id: string; created_at?: string } | null } = {
  user: { id: "u1", created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
};

vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

let approvalQueryCount = 0;
let approvalMode: "error" | "timeout" | "ok" = "ok";

let onboardingQueryCount = 0;
let onboardingMode: "error" | "timeout" | "ok" = "ok";

vi.mock("@/integrations/supabase/userClient", () => {
  const supabase = {
    from: (table: string) => {
      if (table === "user_approvals") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => {
                approvalQueryCount++;
                if (approvalMode === "timeout") return new Promise(() => {});
                if (approvalMode === "error") return Promise.reject(new Error("fail"));
                return Promise.resolve({ data: { status: "approved" }, error: null });
              },
            }),
          }),
        };
      }
      if (table === "personal_expense_categories") {
        return {
          select: () => ({
            eq: () => {
              onboardingQueryCount++;
              if (onboardingMode === "timeout") return new Promise(() => {});
              if (onboardingMode === "error") return Promise.resolve({ count: null, error: new Error("fail") });
              return Promise.resolve({ count: 0, error: null });
            },
          }),
        };
      }
      return { select: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) };
    },
    channel: () => {
      const ch: any = { on: () => ch, subscribe: () => ch };
      return ch;
    },
    removeChannel: () => {},
  };
  return { supabase };
});

import { useUserApproval } from "../useUserApproval";
import { useNeedsOnboarding } from "../useNeedsOnboarding";

function ApprovalProbe({ onState }: { onState: (s: { loading: boolean; status: string }) => void }) {
  const { loading, status } = useUserApproval();
  onState({ loading, status });
  return null;
}

function OnboardingProbe({ onState }: { onState: (s: { loading: boolean; needs: boolean }) => void }) {
  const { loading, needs } = useNeedsOnboarding();
  onState({ loading, needs });
  return null;
}

describe("useUserApproval — resiliência", () => {
  beforeEach(() => {
    approvalQueryCount = 0;
    approvalMode = "ok";
    authState.user = { id: "u1" };
  });

  it("libera loading=false mesmo com erro na query", async () => {
    approvalMode = "error";
    const states: Array<{ loading: boolean; status: string }> = [];
    render(<ApprovalProbe onState={(s) => states.push(s)} />);
    await waitFor(() => {
      const last = states[states.length - 1];
      expect(last.loading).toBe(false);
      expect(last.status).toBe("none");
    });
  });

  it("libera loading=false com fallback 'none' após timeout", async () => {
    vi.useFakeTimers();
    approvalMode = "timeout";
    const states: Array<{ loading: boolean; status: string }> = [];
    render(<ApprovalProbe onState={(s) => states.push(s)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    vi.useRealTimers();
    await waitFor(() => {
      const last = states[states.length - 1];
      expect(last.loading).toBe(false);
      expect(last.status).toBe("none");
    });
  });

  it("não re-executa a query quando o objeto user muda mas user.id permanece", async () => {
    approvalMode = "ok";
    const states: Array<{ loading: boolean; status: string }> = [];
    const { rerender } = render(<ApprovalProbe onState={(s) => states.push(s)} />);
    await waitFor(() => expect(states[states.length - 1].loading).toBe(false));
    const before = approvalQueryCount;
    // nova referência mesmo id
    authState.user = { id: "u1" };
    rerender(<ApprovalProbe onState={(s) => states.push(s)} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(approvalQueryCount).toBe(before);
  });
});

describe("useNeedsOnboarding — resiliência", () => {
  beforeEach(() => {
    onboardingQueryCount = 0;
    onboardingMode = "ok";
    // usuário recém-criado para atingir o fetch
    authState.user = { id: "u2", created_at: new Date().toISOString() };
    try { localStorage.clear(); } catch { /* noop */ }
  });
  afterEach(() => {
    try { localStorage.clear(); } catch { /* noop */ }
  });

  it("libera loading=false mesmo com erro na query", async () => {
    onboardingMode = "error";
    const states: Array<{ loading: boolean; needs: boolean }> = [];
    render(<OnboardingProbe onState={(s) => states.push(s)} />);
    await waitFor(() => {
      const last = states[states.length - 1];
      expect(last.loading).toBe(false);
      expect(last.needs).toBe(false);
    });
  });

  it("libera loading=false com fallback needs=false após timeout", async () => {
    vi.useFakeTimers();
    onboardingMode = "timeout";
    const states: Array<{ loading: boolean; needs: boolean }> = [];
    render(<OnboardingProbe onState={(s) => states.push(s)} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    vi.useRealTimers();
    await waitFor(() => {
      const last = states[states.length - 1];
      expect(last.loading).toBe(false);
      expect(last.needs).toBe(false);
    });
  });

  it("não re-executa a query quando o objeto user muda mas user.id permanece", async () => {
    onboardingMode = "ok";
    const createdAt = new Date().toISOString();
    authState.user = { id: "u3", created_at: createdAt };
    const states: Array<{ loading: boolean; needs: boolean }> = [];
    const { rerender } = render(<OnboardingProbe onState={(s) => states.push(s)} />);
    await waitFor(() => expect(states[states.length - 1].loading).toBe(false));
    const before = onboardingQueryCount;
    authState.user = { id: "u3", created_at: createdAt };
    rerender(<OnboardingProbe onState={(s) => states.push(s)} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(onboardingQueryCount).toBe(before);
  });
});
