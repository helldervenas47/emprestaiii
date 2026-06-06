import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

// Reports links are stored in telegram_links, distinguished by bot_id pointing
// to the active system bot with purpose='reports'.
async function fetchReportsBotId(): Promise<string | null> {
  const { data } = await supabase
    .from("system_telegram_bots" as any)
    .select("id")
    .eq("purpose", "reports")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

export function useTelegramReportsLink() {
  const { user } = useAuth();
  const [linked, setLinked] = useState<{ chat_id: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportsBotId, setReportsBotId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const botId = reportsBotId ?? await fetchReportsBotId();
    if (botId !== reportsBotId) setReportsBotId(botId);
    if (!botId) { setLinked(null); setLoading(false); return; }
    const { data } = await supabase
      .from("telegram_links" as any)
      .select("chat_id").eq("user_id", user.id).eq("bot_id", botId).maybeSingle();
    setLinked(data ? { chat_id: (data as any).chat_id } : null);
    setLoading(false);
  }, [user, reportsBotId]);

  useEffect(() => {
    refresh();
    const channel = supabase.channel(
      `telegram_reports_links_self:${user?.id ?? "anonymous"}:${Math.random().toString(36).slice(2)}`,
    );

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "telegram_links",
        filter: user ? `user_id=eq.${user.id}` : undefined,
      },
      () => refresh(),
    );

    channel.subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [refresh, user]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    const botId = reportsBotId ?? await fetchReportsBotId();
    if (!botId) return;
    await supabase.from("telegram_links" as any).delete()
      .eq("user_id", user.id).eq("bot_id", botId);
    setLinked(null);
  }, [user, reportsBotId]);

  return { linked, loading, refresh, disconnect };
}
