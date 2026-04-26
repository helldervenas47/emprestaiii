import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ViewingSession {
  viewing_user_id: string;
  started_at: string;
  target_name?: string;
}

/**
 * Hook to manage admin "View as user" sessions.
 * When active, all RLS-scoped queries return data of the target user (read-only).
 */
export function useViewAsUser() {
  const { user, role } = useAuth();
  const [session, setSession] = useState<ViewingSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || role !== "admin") {
      setSession(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("admin_viewing_sessions" as any)
      .select("viewing_user_id, started_at")
      .eq("admin_id", user.id)
      .maybeSingle();

    if (data) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", (data as any).viewing_user_id)
        .maybeSingle();
      setSession({
        viewing_user_id: (data as any).viewing_user_id,
        started_at: (data as any).started_at,
        target_name: profile?.display_name || "Usuário",
      });
    } else {
      setSession(null);
    }
    setLoading(false);
  }, [user, role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startViewing = useCallback(
    async (targetUserId: string) => {
      if (!user || role !== "admin") return { error: "Não autorizado" };
      const { error } = await supabase
        .from("admin_viewing_sessions" as any)
        .upsert(
          { admin_id: user.id, viewing_user_id: targetUserId, started_at: new Date().toISOString() },
          { onConflict: "admin_id" }
        );
      if (!error) {
        // Reload page so all hooks rehydrate with new dataOwnerId
        window.location.reload();
      }
      return { error: error?.message };
    },
    [user, role]
  );

  const stopViewing = useCallback(async () => {
    if (!user) return;
    await supabase.from("admin_viewing_sessions" as any).delete().eq("admin_id", user.id);
    window.location.reload();
  }, [user]);

  return {
    session,
    isViewingAs: !!session,
    loading,
    startViewing,
    stopViewing,
    refresh,
  };
}
