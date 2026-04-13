import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useDataOwner() {
  const { user } = useAuth();
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setDataOwnerId(null);
      return;
    }

    const fetch = async () => {
      const { data } = await supabase
        .from("user_owner" as any)
        .select("owner_id")
        .eq("user_id", user.id)
        .maybeSingle();

      setDataOwnerId((data as any)?.owner_id || user.id);
    };

    fetch();
  }, [user]);

  return dataOwnerId;
}
