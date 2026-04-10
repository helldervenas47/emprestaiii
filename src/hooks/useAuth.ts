import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If sessionStorage flag is missing, user closed the tab — force sign out
    if (!sessionStorage.getItem("hvcred_session")) {
      // Clear persisted session so user must log in again
      supabase.auth.signOut().then(() => {
        setLoading(false);
      });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        if (session) {
          sessionStorage.setItem("hvcred_session", "1");
        } else {
          sessionStorage.removeItem("hvcred_session");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      // Only use session if sessionStorage flag exists (tab wasn't closed)
      if (session && sessionStorage.getItem("hvcred_session")) {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    sessionStorage.removeItem("hvcred_session");
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}
