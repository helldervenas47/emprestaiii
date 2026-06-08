// Vincula o usuário autenticado a um chat do Telegram a partir de um código.
// Fluxos aceitos:
// 1) /code no bot -> usuário cola o código alfanumérico no app.
// 2) código numérico do app -> usuário enviou /start CODE ao bot.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getReportsBotId } from "../_shared/reports-bot.ts";

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

async function linkByBotCode(admin: any, userId: string, rawCode: string, requestedKind?: string) {
  const botCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z0-9]{6,12}$/.test(botCode)) return null;

  let kind = requestedKind === "reports" ? "reports" : "expenses";
  const since = new Date(Date.now() - 16 * 60 * 1000).toISOString();
  const { data: recentMessages, error: msgErr } = await admin
    .from("telegram_messages")
    .select("chat_id, text, raw_update, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  if (msgErr) throw msgErr;

  let matched: any = null;
  for (const message of recentMessages ?? []) {
    const text = String(message.text ?? "").trim();
    if (!/^\/c(?:ode|odigo|ódigo)?(?:@\w+)?\s*$/i.test(text)) continue;
    const chatId = Number(message.chat_id);
    const validCodes = [
      await generateChatLinkCode(chatId, kind, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!),
      await generateChatLinkCode(chatId, kind, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Date.now() - 15 * 60 * 1000),
    ];
    if (validCodes.includes(botCode)) {
      matched = message;
      break;
    }
  }

  if (!matched) {
    const { data: legacyRow, error: legacyErr } = await admin
      .from("telegram_bots")
      .select("id, kind, chat_id, bot_id, expires_at")
      .eq("bot_code", botCode)
      .maybeSingle();
    if (legacyErr && legacyErr.code !== "PGRST205" && legacyErr.code !== "42P01") throw legacyErr;
    if (!legacyRow) return null;
    kind = legacyRow.kind === "reports" ? "reports" : "expenses";
    if (legacyRow.expires_at && new Date(legacyRow.expires_at).getTime() < Date.now()) {
      await admin.from("telegram_bots").delete().eq("id", legacyRow.id);
      return json({ error: "Código expirado. Gere um novo no Telegram." }, 410);
    }
    matched = {
      chat_id: legacyRow.chat_id,
      raw_update: { _system_bot_id: legacyRow.bot_id },
      legacy_id: legacyRow.id,
    };
  }
  if (requestedKind && requestedKind !== kind) {
    return json({ error: `Esse código é de ${kind === "reports" ? "relatórios" : "despesas"}.` }, 400);
  }

  // Both expenses and reports links live in telegram_links, distinguished by bot_id.
  const rawBotId = matched.raw_update?._system_bot_id ?? null;
  const { data: systemBot } = rawBotId
    ? await admin.from("system_telegram_bots").select("id, bot_username, name").eq("id", rawBotId).maybeSingle()
    : await admin.from("system_telegram_bots").select("id, bot_username, name").eq("purpose", kind).eq("active", true).order("created_at", { ascending: true }).limit(1).maybeSingle();
  const chatId = Number(matched.chat_id);
  const targetBotId = systemBot?.id ?? null;

  // Remove only the same-kind link for this user/chat (keep the other-kind link intact)
  let delQuery = admin.from("telegram_links").delete().or(`chat_id.eq.${chatId},user_id.eq.${userId}`);
  if (targetBotId) delQuery = delQuery.eq("bot_id", targetBotId);
  await delQuery;
  const { error: insErr } = await admin.from("telegram_links").insert({
    user_id: userId,
    chat_id: chatId,
    bot_id: targetBotId,
  });
  if (insErr) return json({ error: insErr.message }, 500);

  if (matched.legacy_id) {
    await admin.from("telegram_bots").delete().eq("id", matched.legacy_id);
  }

  return json({ ok: true, kind, chat_id: chatId, message: "Bot vinculado com sucesso." });
}

async function generateChatLinkCode(chatId: number, kind: string, secret: string, now = Date.now()): Promise<string> {
  const bucket = Math.floor(now / (15 * 60 * 1000));
  const payload = `${kind}:${chatId}:${bucket}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const bytes = Array.from(new Uint8Array(signature.slice(0, 8)));
  const value = bytes.reduce((acc, byte) => acc * 256n + BigInt(byte), 0n);
  return value.toString(36).toUpperCase().padStart(10, "0").slice(0, 6);
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
    const requestedKind = body?.kind === "reports" || body?.kind === "expenses" ? body.kind : undefined;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Flush pending Telegram updates so the recent /code message is persisted.
    await Promise.all([
      fetch(`${SUPABASE_URL}/functions/v1/telegram-poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: "{}",
      }).catch(() => null),
      fetch(`${SUPABASE_URL}/functions/v1/telegram-reports-poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        body: "{}",
      }).catch(() => null),
    ]);

    const botCodeResult = await linkByBotCode(admin, userId, rawCode, requestedKind);
    if (botCodeResult) return botCodeResult;


    const code = rawCode.trim().replace(/[^0-9]/g, "");
    if (!code || code.length !== 6) {
      return json({
        error: "Código inválido. Gere um código no app ou envie /code no bot do Telegram.",
      }, 400);
    }

    // Aciona o processamento das mensagens pendentes (caso o webhook ainda não tenha rodado).
    await fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch(() => null);

    // Já vinculado? (telegram-process pode ter criado o link via /start CODE)
    // Filtra para NÃO considerar links do bot de relatórios.
    const reportsBotId = await getReportsBotId(admin);
    let existingQuery = admin
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", userId);
    if (reportsBotId) existingQuery = existingQuery.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
    const { data: existingLink } = await existingQuery.maybeSingle();
    if (existingLink) {
      return json({ ok: true, chat_id: existingLink.chat_id, already_linked: true });
    }

    // Localiza o código gerado pelo app (somente códigos de despesas — bot_id null ou != reports)
    let codeQuery = admin
      .from("telegram_link_codes")
      .select("code, user_id, expires_at, bot_id")
      .eq("code", code);
    if (reportsBotId) codeQuery = codeQuery.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
    const { data: codeRow } = await codeQuery.maybeSingle();

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

    // Remove vínculos antigos do mesmo chat ou usuário (somente do lado despesas), depois cria o novo
    let delQuery = admin
      .from("telegram_links")
      .delete()
      .or(`chat_id.eq.${chatId},user_id.eq.${userId}`);
    if (reportsBotId) delQuery = delQuery.or(`bot_id.is.null,bot_id.neq.${reportsBotId}`);
    await delQuery;

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
