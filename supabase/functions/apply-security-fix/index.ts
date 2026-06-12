// One-shot bootstrap to lock down user_roles and system_telegram_bots on Cloud DB.
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const SQL = `
  drop policy if exists "Users can view their own roles" on public.user_roles;
  drop policy if exists "Users view own role" on public.user_roles;
  create policy "Users view own role"
    on public.user_roles for select to authenticated
    using (user_id = auth.uid());

  revoke select (token) on public.system_telegram_bots from authenticated;
  revoke select (token) on public.system_telegram_bots from anon;
`;

Deno.serve(async () => {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const client = new Client(dbUrl);
  await client.connect();
  try {
    await client.queryArray(SQL);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
});
