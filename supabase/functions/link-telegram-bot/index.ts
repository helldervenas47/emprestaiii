// Vincula o usuário autenticado a um chat do Telegram a partir de um código
// gerado pelo app (telegram-link-code). O usuário deve ter enviado /start CODE
// para o bot antes de chamar esta função.
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
    const code = rawCode.trim().replace(/[^0-9]/g, "");
    if (!code || code.length !== 6) {
      return json({
        error: "Código inválido. Gere um código de 6 dígitos no app e envie /start CÓDIGO ao bot.",
      }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Aciona o processamento das mensagens pendentes (caso o webhook ainda não tenha rodado).
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch(() => null);

    // Já vinculado? (telegram-process pode ter criado o link via /start CODE)
    const { data: existingLink } = await admin
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingLink) {
      return json({ ok: true, chat_id: existingLink.chat_id, already_linked: true });
    }

    // Localiza o código gerado pelo app
    const { data: codeRow } = await admin
      .from("telegram_link_codes")
      .select("code, user_id, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (!codeRow) {
      return json({ error: `Código ${code} não encontrado. Gere um novo no app.` }, 404);
    }
    if (codeRow.user_id !== userId) {
      return json({ error: "Esse código pertence a outro usuário." }, 403);
    }
    if (new Date(codeRow.expires_at).getTime() < Date.now()) {
      await admin.from("telegram_link_codes").delete().eq("code", code);
      return json({ error: "Código expirado. Gere um novo no app." }, 410);
    }

    // Procura uma mensagem recente contendo o código
    const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: messages } = await admin
      .from("telegram_messages")
      .select("chat_id, text, created_at")
      .gte("created_at", since)
      .ilike("text", `%${code}%`)
      .order("created_at", { ascending: false })
      .limit(1);

    const chatId = messages?.[0]?.chat_id;
    if (!chatId) {
      return json({
        error: "Ainda não recebemos sua mensagem. Envie /start " + code + " ao bot no Telegram e tente de novo.",
      }, 404);
    }

    // Remove vínculos antigos do mesmo chat ou usuário, depois cria o novo
    await admin
      .from("telegram_links")
      .delete()
      .or(`chat_id.eq.${chatId},user_id.eq.${userId}`);

    const { error: insErr } = await admin
      .from("telegram_links")
      .insert({ user_id: userId, chat_id: chatId });
    if (insErr) return json({ error: insErr.message }, 500);

    await admin.from("telegram_link_codes").delete().eq("code", code);

    return json({ ok: true, chat_id: chatId, message: "Bot vinculado com sucesso." });
  } catch (e: any) {
    return json({ error: e?.message ?? "Erro interno" }, 500);
  }
});
