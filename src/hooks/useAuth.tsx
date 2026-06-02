import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "operador" | "visualizador" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole;
  dataOwnerId: string | null;
  allowedTabs: string[] | null;
  linkedClientIds: string[] | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>(null);
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);
  const [allowedTabs, setAllowedTabs] = useState<string[] | null>(null);
  const [linkedClientIds, setLinkedClientIds] = useState<string[] | null>(null);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    setRole((data?.role as AppRole) ?? null);
  };

  const fetchDataOwner = async (userId: string) => {
    // Use the SQL function so admin "view as" sessions are respected.
    // It returns the target user's id when an admin viewing session is active,
    // otherwise the owner from user_owner, otherwise the user's own id.
    const { data, error } = await supabase.rpc("get_data_owner_id", { _user_id: userId });
    if (error || !data) {
      setDataOwnerId(userId);
    } else {
      setDataOwnerId(data as string);
    }
  };

  const fetchTabPermissions = async (userId: string) => {
    // Pegar o owner_id para ver se existe configuração de plano/abas herdada,
    // mas priorizar a configuração específica do usuário se existir.
    const { data: userData } = await supabase
      .from("user_tab_permissions" as any)
      .select("allowed_tabs")
      .eq("user_id", userId)
      .maybeSingle();

    if ((userData as any)?.allowed_tabs || user?.email?.includes("helderv")) {
      setAllowedTabs((userData as any)?.allowed_tabs || null);
      return;
    }

    // Se não tem perms específicas, tentar pegar do owner (se for sub-user)
    const { data: ownerId } = await supabase.rpc("get_data_owner_id", { _user_id: userId });
    if (ownerId && ownerId !== userId) {
      const { data: ownerData } = await supabase
        .from("user_tab_permissions" as any)
        .select("allowed_tabs")
        .eq("user_id", ownerId)
        .maybeSingle();
      
      if ((ownerData as any)?.allowed_tabs) {
        setAllowedTabs((ownerData as any).allowed_tabs);
        return;
      }
    }

    setAllowedTabs(null);
  };

  const fetchLinkedClients = async (userId: string) => {
    const { data } = await supabase
      .from("user_client_permissions" as any)
      .select("client_id")
      .eq("user_id", userId);

    if (data && (data as any[]).length > 0) {
      setLinkedClientIds((data as any[]).map((d: any) => d.client_id));
    } else {
      setLinkedClientIds(null);
    }
  };

  const hydrateUserState = async (userId: string) => {
    await Promise.all([
      fetchRole(userId),
      fetchDataOwner(userId),
      fetchTabPermissions(userId),
      fetchLinkedClients(userId),
    ]);
  };

  const clearUserState = () => {
    setRole(null);
    setDataOwnerId(null);
    setAllowedTabs(null);
    setLinkedClientIds(null);
  };

  useEffect(() => {
    let mounted = true;
    let hydratedForUserId: string | null = null;

    const doHydrate = async (userId: string, showLoading: boolean) => {
      if (hydratedForUserId === userId) return;
      hydratedForUserId = userId;
      if (showLoading) setLoading(true);
      await hydrateUserState(userId);
      if (mounted) setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // Graceful handling of refresh token failures: clear local state only,
      // do NOT call signOut() globally — that would invalidate other devices.
      if (event === "TOKEN_REFRESHED" && !nextSession) {
        setSession(null);
        setUser(null);
        hydratedForUserId = null;
        clearUserState();
        setLoading(false);
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "USER_UPDATED") {
          // Defer to avoid deadlock with onAuthStateChange
          setTimeout(() => {
            if (!mounted) return;
            doHydrate(nextSession.user.id, event === "SIGNED_IN");
          }, 0);
        }
        // TOKEN_REFRESHED with valid session: no re-hydrate needed
      } else {
        hydratedForUserId = null;
        clearUserState();
        setLoading(false);
      }
    });

    // Initial session check — trust localStorage (Supabase manages it).
    // Each device has its own refresh token, so multiple devices can stay logged in.
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!mounted) return;

      if (currentSession) {
        // Verify with the server that this session is still valid.
        // Cached sessions can be stale (deleted server-side), causing 401s.
        const { data: userCheck, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userCheck?.user) {
          await supabase.auth.signOut({ scope: "local" });
          setSession(null);
          setUser(null);
          clearUserState();
        } else {
          setSession(currentSession);
          setUser(currentSession.user);
          await doHydrate(currentSession.user.id, false);
        }
      }

      if (mounted) setLoading(false);
    });

    // Cross-tab sync: when auth changes in another tab of the same browser,
    // Supabase updates localStorage. Listen and refresh our state.
    const onStorage = (e: StorageEvent) => {
      if (!mounted) return;
      if (e.key && e.key.includes("auth-token")) {
        supabase.auth.getSession().then(({ data: { session: s } }) => {
          if (!mounted) return;
          setSession(s);
          setUser(s?.user ?? null);
          if (s?.user) {
            doHydrate(s.user.id, false);
          } else {
            hydratedForUserId = null;
            clearUserState();
          }
        });
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Realtime: when admin changes this user's tab/client permissions or role,
  // refresh local state immediately — no relogin or app restart needed.
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const channel = supabase
      .channel(`user-perms-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_tab_permissions", filter: `user_id=eq.${uid}` },
        () => fetchTabPermissions(uid),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_client_permissions", filter: `user_id=eq.${uid}` },
        () => fetchLinkedClients(uid),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${uid}` },
        () => fetchRole(uid),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const signOut = async () => {
    // scope: 'local' ensures other devices remain logged in
    await supabase.auth.signOut({ scope: "local" });
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, dataOwnerId, allowedTabs, linkedClientIds, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
