// 🔒 One-shot: opera EXCLUSIVAMENTE no banco Lovable Cloud (lcjelojqxpnphupsnmuq)
// via SUPABASE_DB_URL. NUNCA toca o Supabase externo.
//
// Faz:
//  1. DELETE FROM public.telegram_messages, public.system_telegram_bots
//  2. REVOKE ALL ... FROM anon, authenticated no schema public
//  3. ALTER DEFAULT PRIVILEGES idem
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  const supaUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_DB_URL não configurado" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!supaUrl.includes("lcjelojqxpnphupsnmuq")) {
    return new Response(JSON.stringify({ error: "SUPABASE_URL não aponta para Lovable Cloud esperada", url: supaUrl }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sql = postgres(dbUrl, { ssl: "require", max: 1, prepare: false });
  const report: Record<string, unknown> = { target: supaUrl };
  try {
    const tm = await sql`DELETE FROM public.telegram_messages`;
    report.deleted_telegram_messages = tm.count ?? 0;
    const sb = await sql`DELETE FROM public.system_telegram_bots`;
    report.deleted_system_telegram_bots = sb.count ?? 0;

    await sql.unsafe(`
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    `);
    report.revoked = true;

    return new Response(JSON.stringify(report, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    report.error = e?.message ?? String(e);
    return new Response(JSON.stringify(report, null, 2), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
});
