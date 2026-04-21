import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { setAppTimezone, getAppTimezone, subscribeAppTimezone } from "@/lib/timezone";

export interface AccountSettings {
  timezone: string;
  simulationInterestRate: number;
}

export function useAccountSettings() {
  const { user, dataOwnerId } = useAuth();
  const [settings, setSettings] = useState<AccountSettings>({ timezone: getAppTimezone(), simulationInterestRate: 30 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Keep local state in sync with global cached timezone.
  useEffect(() => {
    const unsub = subscribeAppTimezone((tz) => setSettings((s) => ({ ...s, timezone: tz })));
    return unsub;
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!user || !dataOwnerId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("account_settings")
      .select("timezone, simulation_interest_rate")
      .eq("owner_id", dataOwnerId)
      .maybeSingle();
    const tz = data?.timezone || "America/Sao_Paulo";
    const simulationInterestRate = Number(data?.simulation_interest_rate ?? 30);
    setAppTimezone(tz);
    setSettings({ timezone: tz, simulationInterestRate: Number.isFinite(simulationInterestRate) ? simulationInterestRate : 30 });
    setLoading(false);
  }, [user, dataOwnerId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Realtime: pick up changes done from another device/user in the account.
  useEffect(() => {
    if (!dataOwnerId) return;
    const channel = supabase.channel(`account-settings-${dataOwnerId}-${Math.random().toString(36).slice(2)}`);
    channel.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table: "account_settings", filter: `owner_id=eq.${dataOwnerId}` },
      (payload: any) => {
        const tz = (payload.new as any)?.timezone;
        if (tz) setAppTimezone(tz);
        if (payload.new) {
          setSettings({
            timezone: (payload.new as any)?.timezone || getAppTimezone(),
            simulationInterestRate: Number((payload.new as any)?.simulation_interest_rate ?? 30) || 30,
          });
        }
      },
    );
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [dataOwnerId]);

  const updateTimezone = useCallback(async (timezone: string) => {
    if (!user || !dataOwnerId) return false;
    setSaving(true);
    setAppTimezone(timezone); // optimistic
    setSettings((current) => ({ ...current, timezone }));
    const { error } = await (supabase as any)
      .from("account_settings")
      .upsert({ owner_id: dataOwnerId, timezone }, { onConflict: "owner_id" });
    setSaving(false);
    return !error;
  }, [user, dataOwnerId]);

  const updateSimulationInterestRate = useCallback(async (simulationInterestRate: number) => {
    if (!user || !dataOwnerId) return false;
    setSaving(true);
    setSettings((current) => ({ ...current, simulationInterestRate }));
    const { error } = await (supabase as any)
      .from("account_settings")
      .upsert({ owner_id: dataOwnerId, simulation_interest_rate: simulationInterestRate }, { onConflict: "owner_id" });
    setSaving(false);
    return !error;
  }, [user, dataOwnerId]);

  return { settings, loading, saving, updateTimezone, updateSimulationInterestRate };
}
