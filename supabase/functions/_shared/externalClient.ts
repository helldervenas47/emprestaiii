import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const createExternalClient = () => {
  const url = Deno.env.get("EXTERNAL_SUPABASE_URL");
  const key = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Missing EXTERNAL_SUPABASE_URL or EXTERNAL_SUPABASE_SERVICE_ROLE_KEY environment variables");
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
};
