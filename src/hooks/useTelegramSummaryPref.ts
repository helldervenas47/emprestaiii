import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TelegramSummaryPref {
  enabled: boolean;
  send_time: string;
}

export function useTelegramSummaryPref() {
  const { user } = useAuth();
  const [pref, setPref] = useState<TelegramSummaryPref>({ enabled: false, send_time: "19:00" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("telegram_summary_prefs" as any)
        .select("enabled, send_time")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPref({ enabled: (data as any).enabled, send_time: (data as any).send_time });
      setLoading(false);
    })();
  }, [user]);

  const update = useCallback(async (updates: Partial<TelegramSummaryPref>) => {
    if (!user) return;
    const next = { ...pref, ...updates };
    setPref(next);
    await supabase.from("telegram_summary_prefs" as any).upsert(
      { user_id: user.id, enabled: next.enabled, send_time: next.send_time },
      { onConflict: "user_id" }
    );
  }, [user, pref]);

  return { pref, loading, update };
}
