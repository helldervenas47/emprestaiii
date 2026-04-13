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
    const [{ data: isAdmin }, { data: isOperador }, { data: isVisualizador }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "operador" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "visualizador" }),
    ]);

    if (isAdmin) {
      setRole("admin");
      return;
    }
    if (isOperador) {
      setRole("operador");
      return;
    }
    if (isVisualizador) {
      setRole("visualizador");
      return;
    }
    setRole(null);
  };

  const fetchDataOwner = async (userId: string) => {
    const { data } = await supabase
      .from("user_owner" as any)
      .select("owner_id")
      .eq("user_id", userId)
      .maybeSingle();

    setDataOwnerId((data as any)?.owner_id || userId);
  };

  const fetchTabPermissions = async (userId: string) => {
    const { data } = await supabase
      .from("user_tab_permissions" as any)
      .select("allowed_tabs")
      .eq("user_id", userId)
      .maybeSingle();

    setAllowedTabs((data as any)?.allowed_tabs || null);
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

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        sessionStorage.setItem("hvcred_session", "1");
        setLoading(true);

        setTimeout(() => {
          if (!mounted) return;
          hydrateUserState(nextSession.user.id).finally(() => {
            if (mounted) setLoading(false);
          });
        }, 0);
      } else {
        sessionStorage.removeItem("hvcred_session");
        setRole(null);
        setDataOwnerId(null);
        setAllowedTabs(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!mounted) return;

      if (currentSession && sessionStorage.getItem("hvcred_session")) {
        setSession(currentSession);
        setUser(currentSession.user);
        await hydrateUserState(currentSession.user.id);
      } else if (!sessionStorage.getItem("hvcred_session")) {
        await supabase.auth.signOut();
      }

      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    sessionStorage.removeItem("hvcred_session");
    await supabase.auth.signOut();
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

