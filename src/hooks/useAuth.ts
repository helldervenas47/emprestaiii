import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Sign out when tab/window is closed (not on refresh)
    const handleBeforeUnload = () => {
      // Mark that we're navigating away
      sessionStorage.setItem("hvcred_active", "1");
    };
    const handleLoad = () => {
      // If the flag is not set, it means the tab was closed and reopened — sign out
      if (!sessionStorage.getItem("hvcred_active")) {
        supabase.auth.signOut();
      }
    };

    // Set flag on current session
    sessionStorage.setItem("hvcred_active", "1");
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, signOut };
}
