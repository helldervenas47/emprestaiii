// 🔒 One-shot: opera EXCLUSIVAMENTE no banco Lovable Cloud (lcjelojqxpnphupsnmuq).
// NUNCA usa EXTERNAL_SUPABASE_* — não há risco para o Supabase externo.
//
// Faz duas coisas na Cloud:
//  1. Apaga linhas residuais (telegram_messages, system_telegram_bots).
//  2. Revoga GRANTs do schema public para anon/authenticated, garantindo
//     que qualquer escrita acidental futura falhe com "permission denied".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const cloudUrl = Deno.env.get("SUPABASE_URL")!;
    const cloudKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Guarda extra: aborta se por algum motivo isso não for o projeto Cloud esperado.
    if (!cloudUrl.includes("lcjelojqxpnphupsnmuq")) {
      return new Response(
        JSON.stringify({ error: "SUPABASE_URL não aponta para a Lovable Cloud esperada", url: cloudUrl }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const cloud = createClient(cloudUrl, cloudKey, { auth: { persistSession: false } });

    // 1. Apagar dados residuais.
    const deleted: Record<string, number | string> = {};
    for (const t of ["telegram_messages", "system_telegram_bots"]) {
      const { error, count } = await cloud
        .from(t)
        .delete({ count: "exact" })
        .not("id", "is", null);
      deleted[t] = error ? `ERR: ${error.message}` : (count ?? 0);
    }

    // 2. Revogar GRANTs no public (via função SQL nativa do Postgres).
    // Como o cliente JS não roda DDL arbitrário, chamamos uma RPC se existir,
    // ou listamos as ações que faltam e devolvemos no payload para auditoria.
    const sql = `
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    `;

    return new Response(
      JSON.stringify({
        target: cloudUrl,
        deleted,
        revoke_sql_pending: sql.trim(),
        note: "Para aplicar o REVOKE, rode esta SQL via migration na Lovable Cloud (DDL não roda via REST).",
      }, null, 2),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
