import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

export function useDataOwner() {
  const { user, dataOwnerId: authOwnerId } = useAuth();
  const userId = user?.id ?? null;
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(authOwnerId ?? null);

  useEffect(() => {
    if (!userId) {
      setDataOwnerId(null);
      return;
    }
    // Prefer the value already resolved by useAuth to avoid a duplicate RPC.
    if (authOwnerId) {
      setDataOwnerId(authOwnerId);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_data_owner_id", { _user_id: userId });
      if (cancelled) return;
      setDataOwnerId(error || !data ? userId : (data as string));
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, authOwnerId]);

  return dataOwnerId;
}
