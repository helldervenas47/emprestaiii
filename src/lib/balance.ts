import { supabase } from "@/integrations/supabase/client";

async function getDataOwnerId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data } = await supabase
    .from("user_owner" as any)
    .select("owner_id")
    .eq("user_id", user.id)
    .maybeSingle();
  
  return (data as any)?.owner_id || user.id;
}

export async function getBalance(): Promise<number> {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return 0;

  const { data } = await supabase
    .from("balance")
    .select("amount")
    .eq("user_id", ownerId)
    .maybeSingle();

  return data?.amount ?? 0;
}

export async function setBalance(value: number) {
  const ownerId = await getDataOwnerId();
  if (!ownerId) return;

  const { data: existing } = await supabase
    .from("balance")
    .select("id")
    .eq("user_id", ownerId)
    .maybeSingle();

  if (existing) {
    await supabase.from("balance").update({ amount: value, updated_at: new Date().toISOString() }).eq("user_id", ownerId);
  } else {
    await supabase.from("balance").insert({ user_id: ownerId, amount: value });
  }
}

export async function adjustBalance(delta: number) {
  const current = await getBalance();
  await setBalance(current + delta);
}

/**
 * Offline-aware balance adjust. If offline (or server fails), the delta is
 * stored locally and applied once the connection is restored.
 */
export async function adjustBalanceOffline(delta: number) {
  if (!delta) return;
  const { isOnline } = await import("@/lib/offline/status");
  const { enqueueBalanceAdjust } = await import("@/lib/offline/sync");
  if (!isOnline()) {
    await enqueueBalanceAdjust(delta);
    return;
  }
  try {
    await adjustBalance(delta);
  } catch {
    await enqueueBalanceAdjust(delta);
  }
}
