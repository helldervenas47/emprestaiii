import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "none";

export function useUserApproval() {
  const { user } = useAuth();
  const [status, setStatus] = useState<ApprovalStatus>("none");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setStatus("none");
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchStatus = async () => {
      const { data } = await (supabase as any)
        .from("user_approvals")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!mounted) return;
      setStatus((data?.status as ApprovalStatus) || "none");
      setLoading(false);
    };

    fetchStatus();

    // Realtime: user sees own status flip to approved
    const channel = supabase
      .channel(`approval-self-${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_approvals", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const newStatus = payload.new?.status as ApprovalStatus | undefined;
          if (newStatus) setStatus(newStatus);
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [user]);

  return { status, loading, isPending: status === "pending", isRejected: status === "rejected" };
}
