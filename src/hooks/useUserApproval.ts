import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { useAuth } from "./useAuth";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "none";

const APPROVAL_TIMEOUT_MS = 6000;

export function useUserApproval() {
  const { user } = useAuth();
  const [status, setStatus] = useState<ApprovalStatus>("none");
  const [loading, setLoading] = useState(true);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) {
      setStatus("none");
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchStatus = async () => {
      try {
        const query = (supabase as any)
          .from("user_approvals")
          .select("status")
          .eq("user_id", userId)
          .maybeSingle();

        const timeout = new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), APPROVAL_TIMEOUT_MS),
        );

        const { data } = (await Promise.race([query, timeout])) as { data: { status?: string } | null };
        if (!mounted) return;
        setStatus((data?.status as ApprovalStatus) || "none");
      } catch {
        if (!mounted) return;
        setStatus("none");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchStatus();

    // Realtime: user sees own status flip to approved
    const channel = supabase
      .channel(`approval-self-${userId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_approvals", filter: `user_id=eq.${userId}` },
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
  }, [userId]);

  return { status, loading, isPending: status === "pending", isRejected: status === "rejected" };
}
