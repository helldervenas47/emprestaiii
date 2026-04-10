import { supabase } from "@/integrations/supabase/client";

export async function getBalance(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data } = await supabase
    .from("balance")
    .select("amount")
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.amount ?? 0;
}

export async function setBalance(value: number) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: existing } = await supabase
    .from("balance")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("balance").update({ amount: value, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  } else {
    await supabase.from("balance").insert({ user_id: user.id, amount: value });
  }
}

export async function adjustBalance(delta: number) {
  const current = await getBalance();
  await setBalance(current + delta);
}
