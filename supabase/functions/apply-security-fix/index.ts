// One-shot bootstrap: applies the user_roles + system_telegram_bots
// lockdown to the Lovable Cloud DB. Delete after running.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key);
  const sql = `
    drop policy if exists "Users can view their own roles" on public.user_roles;
    drop policy if exists "Users view own role" on public.user_roles;
    create policy "Users view own role"
      on public.user_roles for select to authenticated
      using (user_id = auth.uid());

    revoke select (token) on public.system_telegram_bots from authenticated;
    revoke select (token) on public.system_telegram_bots from anon;
  `;
  const { data, error } = await sb.rpc("exec_sql", { sql_query: sql });
  return new Response(JSON.stringify({ data, error }), { headers: { "Content-Type": "application/json" } });
});
