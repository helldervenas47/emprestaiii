import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/userClient";
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
      // Use SQL function so "view as" sessions and user_owner are both respected.
      const { data, error } = await supabase.rpc("get_data_owner_id", { _user_id: user.id });
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
