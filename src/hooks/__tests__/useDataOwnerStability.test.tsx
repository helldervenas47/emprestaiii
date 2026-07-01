/**
 * useDataOwner — não refaz RPC apenas porque a referência de `user` muda.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const authState: { user: { id: string } | null; dataOwnerId: string | null } = {
  user: { id: "user-1" },
  dataOwnerId: null,
};

vi.mock("../useAuth", () => ({
  useAuth: () => ({ user: authState.user, dataOwnerId: authState.dataOwnerId }),
}));

const rpcSpy = vi.fn();

vi.mock("@/integrations/supabase/userClient", () => ({
  supabase: {
    rpc: (name: string, args: unknown) => rpcSpy(name, args),
  },
}));

import { useDataOwner } from "../useDataOwner";

describe("useDataOwner — estabilidade", () => {
  beforeEach(() => {
    rpcSpy.mockReset();
    rpcSpy.mockResolvedValue({ data: "owner-x", error: null });
    authState.user = { id: "user-1" };
    authState.dataOwnerId = null;
  });

  it("não chama RPC novamente quando a referência de `user` muda mas o id é o mesmo", async () => {
    const { result, rerender } = renderHook(() => useDataOwner());

    await waitFor(() => expect(result.current).toBe("owner-x"));
    expect(rpcSpy).toHaveBeenCalledTimes(1);

    // Nova referência, mesmo id — não deve refetchar.
    act(() => {
      authState.user = { id: "user-1" };
    });
    rerender();
    rerender();
    await new Promise((r) => setTimeout(r, 20));

    expect(rpcSpy).toHaveBeenCalledTimes(1);
  });

  it("usa dataOwnerId do useAuth quando disponível e não dispara RPC", async () => {
    authState.dataOwnerId = "owner-from-auth";
    const { result } = renderHook(() => useDataOwner());

    await waitFor(() => expect(result.current).toBe("owner-from-auth"));
    expect(rpcSpy).not.toHaveBeenCalled();
  });
});
