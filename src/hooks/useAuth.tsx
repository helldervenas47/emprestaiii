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

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    setRole((data?.role as AppRole) || null);
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

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          sessionStorage.setItem("hvcred_session", "1");
          // Use setTimeout to avoid blocking the auth state change callback
           setTimeout(() => {
            if (mounted) {
              fetchRole(session.user.id);
              fetchDataOwner(session.user.id);
              fetchTabPermissions(session.user.id);
            }
          }, 0);
        } else {
          sessionStorage.removeItem("hvcred_session");
          setRole(null);
          setDataOwnerId(null);
          setAllowedTabs(null);
        }
      }
    );

    // Then restore session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session && sessionStorage.getItem("hvcred_session")) {
        setSession(session);
        setUser(session.user);
        fetchRole(session.user.id);
        fetchDataOwner(session.user.id);
        fetchTabPermissions(session.user.id);
      } else if (!sessionStorage.getItem("hvcred_session")) {
        // No stored session marker - sign out quietly
        supabase.auth.signOut();
      }
      setLoading(false);
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
    <AuthContext.Provider value={{ user, session, loading, role, dataOwnerId, allowedTabs, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
