import { supabase } from "@/integrations/supabase/userClient";

let _cached: { id: string | null; ts: number } | null = null;

/**
 * Returns the ID of the active system Telegram bot whose purpose is "reports".
 * Cached for 5 minutes within the page session.
 */
export async function fetchReportsBotId(): Promise<string | null> {
  if (_cached && Date.now() - _cached.ts < 5 * 60 * 1000) return _cached.id;
  const { data } = await supabase
    .from("system_telegram_bots" as any)
    .select("id")
    .eq("purpose", "reports")
    .eq("active", true)
    .order("bot_id", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const id = (data as any)?.id ?? null;
  _cached = { id, ts: Date.now() };
  return id;
}
