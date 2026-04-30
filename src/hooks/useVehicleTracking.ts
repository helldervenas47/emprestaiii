import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface TrackingPosition {
  vehicle_id: string;
  owner_id: string;
  latitude: number;
  longitude: number;
  speed_kmh: number | null;
  ignition: boolean | null;
  address: string | null;
  device_time: string;
  online: boolean;
  updated_at: string;
}

export function useVehicleTracking() {
  const { dataOwnerId } = useAuth();
  const [positions, setPositions] = useState<Record<string, TrackingPosition>>({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tracking_positions")
      .select("*")
      .eq("owner_id", dataOwnerId);
    if (data) {
      const map: Record<string, TrackingPosition> = {};
      for (const p of data as any[]) map[p.vehicle_id] = p;
      setPositions(map);
    }
    setLoading(false);
  }, [dataOwnerId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime subscription
  useEffect(() => {
    if (!dataOwnerId) return;
    const ch = supabase
      .channel("tracking_positions_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tracking_positions", filter: `owner_id=eq.${dataOwnerId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as TrackingPosition;
          if (!row?.vehicle_id) return;
          setPositions((prev) => {
            if (payload.eventType === "DELETE") {
              const { [row.vehicle_id]: _, ...rest } = prev;
              return rest;
            }
            return { ...prev, [row.vehicle_id]: payload.new as TrackingPosition };
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [dataOwnerId]);

  // Recompute "online" client-side every minute
  // (server marks online based on a 10-min window; we soften by re-evaluating)
  useEffect(() => {
    const t = setInterval(() => {
      setPositions((prev) => {
        const out: Record<string, TrackingPosition> = {};
        const now = Date.now();
        for (const [k, p] of Object.entries(prev)) {
          const online = now - new Date(p.device_time).getTime() < 10 * 60 * 1000;
          out[k] = online === p.online ? p : { ...p, online };
        }
        return out;
      });
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  return { positions, loading, refetch: fetchAll };
}
