import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useTelegramReportsLink() {
  const { user } = useAuth();
  const [linked, setLinked] = useState<{ chat_id: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("telegram_reports_links" as any)
      .select("chat_id").eq("user_id", user.id).maybeSingle();
    setLinked(data ? { chat_id: (data as any).chat_id } : null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel("telegram_reports_links_self")
      .on("postgres_changes", { event: "*", schema: "public", table: "telegram_reports_links" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    await supabase.from("telegram_reports_links" as any).delete().eq("user_id", user.id);
    setLinked(null);
  }, [user]);

  return { linked, loading, refresh, disconnect };
}
