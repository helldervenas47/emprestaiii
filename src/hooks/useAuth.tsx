import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/userClient";
import { supabase as functionsClient } from "@/integrations/supabase/client";

import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "gerente" | "cliente" | "visualizador" | null;

// Prioridade: papel mais privilegiado vence quando o usuário tem múltiplos.
const ROLE_PRIORITY: Record<string, number> = {
  admin: 4,
  gerente: 3,
  cliente: 2,
  visualizador: 1,
};

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

  const fetchRole = async (userId: string, accessToken?: string) => {
    let { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    let roles = (data ?? []).map((r: any) => r.role as string);
    if (roles.length === 0) {
      const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
      if (token) {
        const { data: ensuredRole, error: ensureRoleError } = await functionsClient.functions.invoke("ensure-user-role", {
          body: { role: "cliente" },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (ensureRoleError) {
          console.error("[useAuth] ensure-user-role error:", ensureRoleError);
        }
        const retry = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        data = retry.data;
        roles = (data ?? []).map((r: any) => r.role as string);
        if (roles.length === 0 && ensuredRole?.role) {
          roles = [ensuredRole.role as string];
        }
      }
    }
    if (roles.length === 0) {
      setRole(null);
      return;
    }
    const best = roles.sort(
      (a, b) => (ROLE_PRIORITY[b] ?? 0) - (ROLE_PRIORITY[a] ?? 0),
    )[0];
    setRole((best as AppRole) ?? null);
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
    const { data, error } = await supabase
      .from("user_tab_permissions" as any)
      .select("allowed_tabs")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[useAuth] fetchTabPermissions error:", error);
    }
    const tabs = (data as any)?.allowed_tabs ?? null;
    console.debug("[useAuth] allowedTabs for", userId, "=", tabs);
    setAllowedTabs(tabs);
  };

  const fetchLinkedClients = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_client_permissions" as any)
      .select("client_id")
      .eq("user_id", userId);

    if (error) {
      console.error("[useAuth] fetchLinkedClients error:", error);
    }
    if (data && (data as any[]).length > 0) {
      setLinkedClientIds((data as any[]).map((d: any) => d.client_id));
    } else {
      setLinkedClientIds(null);
    }
  };

  const syncProfile = async (user: User) => {
    // upsert evita race condition quando o mesmo usuário faz login em duas
    // abas/dispositivos simultaneamente — sem upsert, o segundo INSERT
    // estouraria por violação de unique(user_id).
    const displayName =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "Usuário";
    const fullName =
      user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      "";
    await supabase
      .from("profiles")
      .upsert(
        {
          user_id: user.id,
          email: user.email,
          full_name: fullName,
          display_name: displayName,
        },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
  };

  const hydrateUserState = async (userId: string, currentUser?: User | null, accessToken?: string) => {
    if (currentUser) {
      await syncProfile(currentUser);
    }

    await Promise.all([
      fetchRole(userId, accessToken),
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

    const doHydrate = async (userId: string, showLoading: boolean, currentUser?: User | null, accessToken?: string) => {
      if (hydratedForUserId === userId) return;
      hydratedForUserId = userId;
      if (showLoading) setLoading(true);
      await hydrateUserState(userId, currentUser, accessToken);
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
            doHydrate(nextSession.user.id, event === "SIGNED_IN", nextSession.user, nextSession.access_token);
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
    (async () => {
      // Guard: tokens emitidos por outro projeto Supabase (ex.: pós-migração)
      // retornam "bad_jwt" / "invalid claim: missing sub claim". Limpamos local
      // e seguimos sem sessão, evitando loop de 403 em /auth/v1/user.
      try {
        const { error: userErr } = await supabase.auth.getUser();
        if (userErr) {
          const msg = `${(userErr as any)?.code || ""} ${userErr.message || ""}`.toLowerCase();
          if (msg.includes("bad_jwt") || msg.includes("missing sub") || msg.includes("invalid claim")) {
            await supabase.auth.signOut({ scope: "local" }).catch(() => {});
            try {
              Object.keys(localStorage).forEach((k) => { if (k.startsWith("sb-")) localStorage.removeItem(k); });
            } catch {}
          }
        }
      } catch {}

      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
        await doHydrate(currentSession.user.id, false, currentSession.user, currentSession.access_token);
      }

      if (mounted) setLoading(false);
    })();

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
              doHydrate(s.user.id, false, s.user, s.access_token);
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
