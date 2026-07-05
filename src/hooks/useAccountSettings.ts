import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";
import { setAppTimezone, getAppTimezone, subscribeAppTimezone } from "@/lib/timezone";

export interface AccountSettings {
  timezone: string;
  simulationInterestRate: number;
  maxCreditLimit: number | null;
}

export function useAccountSettings() {
  const { user, dataOwnerId } = useAuth();
  const [settings, setSettings] = useState<AccountSettings>({ timezone: getAppTimezone(), simulationInterestRate: 30, maxCreditLimit: null });
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
      .select("timezone, simulation_interest_rate, max_credit_limit")
      .eq("owner_id", dataOwnerId)
      .maybeSingle();
    const tz = data?.timezone || "America/Sao_Paulo";
    const simulationInterestRate = Number(data?.simulation_interest_rate ?? 30);
    const rawMax = data?.max_credit_limit;
    const maxCreditLimit = rawMax === null || rawMax === undefined ? null : Number(rawMax);
    setAppTimezone(tz);
    setSettings({
      timezone: tz,
      simulationInterestRate: Number.isFinite(simulationInterestRate) ? simulationInterestRate : 30,
      maxCreditLimit: maxCreditLimit !== null && Number.isFinite(maxCreditLimit) ? maxCreditLimit : null,
    });
    setLoading(false);
  }, [user, dataOwnerId]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  // Realtime removido (P0-02 egress): updates otimistas locais já mantêm o estado.
  // Se precisar propagar entre abas, dispatch `account-settings:changed`.
  useEffect(() => {
    const handler = () => fetchSettings();
    window.addEventListener("account-settings:changed", handler);
    return () => window.removeEventListener("account-settings:changed", handler);
  }, [fetchSettings]);

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

  /**
   * Sets (or clears) the global maximum credit limit. Pass `null` to remove the cap.
   */
  const updateMaxCreditLimit = useCallback(async (maxCreditLimit: number | null) => {
    if (!user || !dataOwnerId) return false;
    setSaving(true);
    setSettings((current) => ({ ...current, maxCreditLimit }));
    const { error } = await (supabase as any)
      .from("account_settings")
      .upsert({ owner_id: dataOwnerId, max_credit_limit: maxCreditLimit }, { onConflict: "owner_id" });
    setSaving(false);
    return !error;
  }, [user, dataOwnerId]);

  return { settings, loading, saving, updateTimezone, updateSimulationInterestRate, updateMaxCreditLimit };
}
