// Vincula o usuário autenticado a um chat do Telegram (despesas ou relatórios)
// a partir de um bot_code curto digitado no app. O bot_code é gerado pelo
// próprio bot (comando /code) e gravado em public.telegram_bots.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    const userId = user?.id;
    if (userErr || !userId) return json({ error: "Unauthorized" }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }

    const rawCode = typeof body?.bot_code === "string" ? body.bot_code : "";
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code || code.length < 4 || code.length > 12) {
      return json({ error: "Código inválido. Informe o bot_code recebido no Telegram." }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    async function findBot() {
      return await admin
        .from("telegram_bots")
        .select("id, bot_code, kind, chat_id, bot_id, expires_at")
        .eq("bot_code", code)
        .maybeSingle();
    }

    async function triggerPollAndProcess() {
      const headers = {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      };
      // Dispara poll dos dois bots (despesas + relatórios) e processa as mensagens
      // antes de tentar localizar o código novamente. Útil quando não há cron ativo.
      await Promise.allSettled([
        fetch(`${SUPABASE_URL}/functions/v1/telegram-poll`, { method: "POST", headers, body: "{}" }),
        fetch(`${SUPABASE_URL}/functions/v1/telegram-reports-poll`, { method: "POST", headers, body: "{}" }),
      ]);
      await fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, { method: "POST", headers, body: "{}" }).catch(() => null);
    }

    let { data: bot, error: botErr } = await findBot();
    if (botErr) return json({ error: botErr.message }, 500);

    if (!bot) {
      // Código pode ter sido gerado agora; sincroniza com polling e processa.
      // Aguarda um pouco para o poll capturar a mensagem /code do Telegram.
      await triggerPollAndProcess();
      await new Promise(r => setTimeout(r, 2000)); // Espera 2s para o poll processar
      const retry = await findBot();
      if (retry.error) return json({ error: retry.error.message }, 500);
      bot = retry.data;
    }


    if (!bot) {
      // Diagnóstico detalhado: lista códigos válidos
      const { data: recent } = await admin
        .from("telegram_bots")
        .select("bot_code, expires_at, kind")
        .gte("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(10);

      const { count: botCount } = await admin
        .from("system_telegram_bots")
        .select("*", { count: "exact", head: true })
        .eq("active", true);

      const expenseCodesActive = recent?.filter((r: any) => r.kind === "expenses").map((r: any) => r.bot_code) || [];
      const reportCodesActive = recent?.filter((r: any) => r.kind === "reports").map((r: any) => r.bot_code) || [];

      let hint = "";
      if (botCount === 0) {
        hint = " ⚠️ Nenhum bot configurado. Contate o administrador.";
      } else if (expenseCodesActive.length === 0 && reportCodesActive.length === 0) {
        hint = " ⏰ Nenhum código ativo. Envie /code ou /c no Telegram agora e cole aqui.";
      } else {
        if (expenseCodesActive.length > 0) hint += ` Despesas: ${expenseCodesActive.join(", ")}.`;
        if (reportCodesActive.length > 0) hint += ` Relatórios: ${reportCodesActive.join(", ")}.`;
      }

      return json({
        error: `Código "${code}" não encontrado.${hint}`,
        hint: hint,
        debug: { code_received: code, bot_count: botCount, active_codes: { expense: expenseCodesActive, reports: reportCodesActive } }
      }, 404);
    }


    if ((bot as any).expires_at && new Date((bot as any).expires_at).getTime() < Date.now()) {
      return json({ error: "Código expirado. Gere um novo no bot enviando /code." }, 410);
    }

    const kind = (bot as any).kind as "expenses" | "reports";
    const chatId = Number((bot as any).chat_id);

    const targetTable = kind === "reports" ? "telegram_reports_links" : "telegram_links";
    const rawLabel = typeof body?.label === "string" ? body.label.trim().slice(0, 80) : "";
    const label = rawLabel || null;

    // Múltiplos vínculos paralelos: chave = (user_id, chat_id).
    // Se já existir, atualiza bot_code/label preservando dados; senão cria novo
    // sem remover outros vínculos existentes do mesmo usuário.
    const { error: upsertErr } = await admin
      .from(targetTable)
      .upsert(
        { user_id: userId, chat_id: chatId, bot_id: (bot as any).bot_id ?? null, bot_code: code, label },
        { onConflict: "user_id,chat_id" },
      );

    if (upsertErr) return json({ error: upsertErr.message }, 500);

    // One-shot: invalida o código consumido (o vínculo persiste em telegram_*_links
    // e pode ser reutilizado por outros relatórios sem refazer o pareamento).
    await admin.from("telegram_bots").delete().eq("id", (bot as any).id);

    return json({
      ok: true,
      kind,
      chat_id: chatId,
      bot_code: code,
      label,
      message: "Bot vinculado com sucesso. O código foi consumido, mas o vínculo permanece salvo.",
    });
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
});
