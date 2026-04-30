import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface TrackingProvider {
  id: string;
  owner_id: string;
  provider: "hapolo" | "traccar" | "custom";
  base_url: string;
  auth_type: "basic" | "bearer";
  credential_secret_name: string;
  enabled: boolean;
  last_sync_at: string | null;
  last_sync_error: string | null;
}

export function useTrackingProvider() {
  const { dataOwnerId } = useAuth();
  const [provider, setProvider] = useState<TrackingProvider | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOne = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tracking_providers")
      .select("*")
      .eq("owner_id", dataOwnerId)
      .maybeSingle();
    setProvider((data as any) ?? null);
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { fetchOne(); }, [fetchOne]);

  const save = useCallback(async (input: Omit<TrackingProvider, "id" | "owner_id" | "last_sync_at" | "last_sync_error">) => {
    if (!dataOwnerId) return;
    const payload = { owner_id: dataOwnerId, ...input };
    const { data, error } = await supabase
      .from("tracking_providers")
      .upsert(payload, { onConflict: "owner_id" })
      .select()
      .single();
    if (error) throw error;
    setProvider(data as any);
    return data;
  }, [dataOwnerId]);

  const remove = useCallback(async () => {
    if (!provider) return;
    await supabase.from("tracking_providers").delete().eq("id", provider.id);
    setProvider(null);
  }, [provider]);

  const triggerSync = useCallback(async () => {
    if (!dataOwnerId) return;
    const { data, error } = await supabase.functions.invoke("sync-vehicle-tracking", {
      body: { owner_id: dataOwnerId },
    });
    if (error) throw error;
    return data;
  }, [dataOwnerId]);

  return { provider, loading, save, remove, triggerSync, refetch: fetchOne };
}
