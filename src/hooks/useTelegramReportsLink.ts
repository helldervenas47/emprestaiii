import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "@/hooks/useAuth";

// Reports links prefer telegram_reports_links so they never compete with expenses.
async function fetchReportsBotId(): Promise<string | null> {
  const { data } = await supabase
    .from("system_telegram_bots" as any)
    .select("id")
    .eq("purpose", "reports")
    .eq("active", true)
    .order("bot_id", { ascending: false, nullsFirst: false })
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
    const { data: dedicated } = await supabase
      .from("telegram_reports_links" as any)
      .select("chat_id")
      .eq("user_id", user.id)
      .eq("bot_id", botId)
      .maybeSingle();

    if (dedicated) {
      setLinked({ chat_id: (dedicated as any).chat_id });
      setLoading(false);
      return;
    }

    const { data: legacy } = await supabase
      .from("telegram_links" as any)
      .select("chat_id")
      .eq("user_id", user.id)
      .eq("bot_id", botId)
      .maybeSingle();

    setLinked(legacy ? { chat_id: (legacy as any).chat_id } : null);
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
        table: "telegram_reports_links",
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
    const { error } = await supabase.from("telegram_reports_links" as any).delete()
      .eq("user_id", user.id).eq("bot_id", botId);
    if (error && error.code !== "42P01" && error.code !== "PGRST205") throw error;
    const { error: legacyError } = await supabase.from("telegram_links" as any).delete()
      .eq("user_id", user.id).eq("bot_id", botId);
    if (legacyError) throw legacyError;
    setLinked(null);
  }, [user, reportsBotId]);

  return { linked, loading, refresh, disconnect };
}
