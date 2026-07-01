/**
 * Fix loading infinito — Etapa 1 do AuthProvider.
 *
 * Verifica que se `ensure-user-role` (Edge Function) travar, o `loading`
 * do AuthProvider ainda resolve para `false` e o role assume fallback
 * seguro "cliente".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, waitFor, act } from "@testing-library/react";

const mockSession = {
  access_token: "tok",
  user: { id: "u1", email: "u@test.com", user_metadata: {} },
};

const emptyEq = () => {
  const p: any = Promise.resolve({ data: [], error: null });
  p.maybeSingle = () => Promise.resolve({ data: null, error: null });
  return p;
};

vi.mock("@/integrations/supabase/userClient", () => {
  const supabase = {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      getUser: () => Promise.resolve({ data: { user: mockSession.user }, error: null }),
      getSession: () => Promise.resolve({ data: { session: mockSession }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: () => ({
      select: () => ({ eq: () => emptyEq() }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    }),
    rpc: () => Promise.resolve({ data: "u1", error: null }),
    channel: () => {
      const ch: any = {
        on: () => ch,
        subscribe: () => ch,
      };
      return ch;
    },
    removeChannel: () => {},
  };
  return {
    supabase,
    USER_SUPABASE_URL: "http://localhost:0",
    USER_SUPABASE_PUBLISHABLE_KEY: "anon-key",
  };
});

import { AuthProvider, useAuth } from "../useAuth";

function Probe({ onState }: { onState: (s: { loading: boolean; role: string | null }) => void }) {
  const { loading, role } = useAuth();
  onState({ loading, role });
  return null;
}

describe("useAuth — timeout de ensure-user-role", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it("resolve loading=false mesmo quando ensure-user-role trava (timeout) e aplica fallback 'cliente'", async () => {
    global.fetch = vi.fn((_url: any, init: any) => {
      return new Promise((_resolve, reject) => {
        const signal: AbortSignal | undefined = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            (err as any).name = "AbortError";
            reject(err);
          });
        }
      });
    }) as any;

    const states: Array<{ loading: boolean; role: string | null }> = [];
    render(
      <AuthProvider>
        <Probe onState={(s) => states.push(s)} />
      </AuthProvider>,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    vi.useRealTimers();

    await waitFor(() => {
      const last = states[states.length - 1];
      expect(last.loading).toBe(false);
      expect(last.role).toBe("cliente");
    });
  });
});
