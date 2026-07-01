/**
 * Fix loading infinito — Etapa 1 do AuthProvider.
 *
 * Verifica que:
 *  1. Se `ensure-user-role` (Edge Function) travar/demorar, o `loading` do
 *     AuthProvider ainda resolve para `false` (não fica preso no spinner).
 *  2. O role assume o fallback seguro "cliente" nesse cenário.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, waitFor, act } from "@testing-library/react";

// Mock do userClient antes de importar o hook.
const mockSession = {
  access_token: "tok",
  user: { id: "u1", email: "u@test.com", user_metadata: {} },
};

const emptyQuery = () => ({
  select: () => ({
    eq: () => Promise.resolve({ data: [], error: null }),
  }),
});

vi.mock("@/integrations/supabase/userClient", () => {
  const supabase = {
    auth: {
      onAuthStateChange: (_cb: any) => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      getUser: () => Promise.resolve({ data: { user: mockSession.user }, error: null }),
      getSession: () => Promise.resolve({ data: { session: mockSession }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: (_t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
        }),
      }),
      upsert: () => Promise.resolve({ data: null, error: null }),
    }),
    rpc: () => Promise.resolve({ data: "u1", error: null }),
    channel: () => ({
      on: function () { return this; },
      subscribe: function () { return this; },
    }),
    removeChannel: () => {},
  };
  return {
    supabase,
    USER_SUPABASE_URL: "http://localhost:0",
    USER_SUPABASE_PUBLISHABLE_KEY: "anon",
  };
});

// Reforço: garantir que from().select().eq() retorne um thenable com data:[]
vi.mock("@/integrations/supabase/userClient", async (orig) => {
  const mod: any = await orig();
  mod.supabase.from = () => ({
    select: () => ({
      eq: () => ({
        // suporta await direto
        then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    upsert: () => Promise.resolve({ data: null, error: null }),
  });
  return mod;
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
    // fetch que respeita AbortController: rejeita AbortError quando abortado.
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
        // nunca resolve por si só
      });
    }) as any;

    const states: Array<{ loading: boolean; role: string | null }> = [];
    render(
      <AuthProvider>
        <Probe onState={(s) => states.push(s)} />
      </AuthProvider>,
    );

    // Avança relógio para além do timeout (8s) e deixa microtasks rodarem.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    await waitFor(() => {
      const last = states[states.length - 1];
      expect(last.loading).toBe(false);
    });

    const last = states[states.length - 1];
    expect(last.role).toBe("cliente");
  });
});
