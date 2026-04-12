import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "admin" | "operador" | "visualizador" | null;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole>(null);

  const fetchRole = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    setRole((data?.role as AppRole) || null);
  };

  useEffect(() => {
    if (!sessionStorage.getItem("hvcred_session")) {
      supabase.auth.signOut().then(() => {
        setLoading(false);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session?.user) {
          sessionStorage.setItem("hvcred_session", "1");
          fetchRole(session.user.id);
        } else {
          sessionStorage.removeItem("hvcred_session");
          setRole(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && sessionStorage.getItem("hvcred_session")) {
        setSession(session);
        setUser(session?.user ?? null);
        fetchRole(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    sessionStorage.removeItem("hvcred_session");
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut, role };
}
