import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

export function useDataOwner() {
  const { user } = useAuth();
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const lastOwnerKeyRef = useRef<string | null>(null);
  const requestCountRef = useRef(0);

  useEffect(() => {
    if (!user) {
      if (import.meta.env.DEV && lastOwnerKeyRef.current !== null) {
        console.debug("[OwnerKey transition]", {
          hook: "useDataOwner",
          oldOwnerKey: lastOwnerKeyRef.current,
          newOwnerKey: null,
          queryKey: ["rpc", "get_data_owner_id", null],
          reason: "no-user",
        });
      }
      lastOwnerKeyRef.current = null;
      setDataOwnerId(null);
      return;
    }

    const fetch = async () => {
      requestCountRef.current += 1;
      if (import.meta.env.DEV) {
        console.debug("[OwnerKey fetch:start]", {
          hook: "useDataOwner",
          count: requestCountRef.current,
          userId: user.id,
          oldOwnerKey: lastOwnerKeyRef.current,
          queryKey: ["rpc", "get_data_owner_id", user.id],
        });
      }
      // Use SQL function so "view as" sessions and user_owner are both respected.
      const { data, error } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
      const nextOwnerKey = error || !data ? user.id : (data as string);
      if (import.meta.env.DEV && lastOwnerKeyRef.current !== nextOwnerKey) {
        console.debug("[OwnerKey transition]", {
          hook: "useDataOwner",
          oldOwnerKey: lastOwnerKeyRef.current,
          newOwnerKey: nextOwnerKey,
          queryKey: ["rpc", "get_data_owner_id", user.id],
          error: error?.message ?? null,
        });
      }
      lastOwnerKeyRef.current = nextOwnerKey;
      if (error || !data) {
        setDataOwnerId(user.id);
      } else {
        setDataOwnerId(data as string);
      }
    };

    fetch();
  }, [user]);

  return dataOwnerId;
}
