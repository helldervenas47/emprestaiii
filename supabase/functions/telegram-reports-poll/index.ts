import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getExternalAdmin } from "../_shared/external-supabase.ts";

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function tgSend(token: string, chatId: number, text: string) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`[reports-poll] tgSend failed ${r.status}`, body);
      // Plain retry
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
    }
  } catch (e) {
    console.error("[reports-poll] tgSend exception", e);
  }
}

async function saveIncomingMessage(supabase: any, update: any, bot: { id: string }) {
  const msg = update.message;
  if (!msg?.chat?.id) return;
  const botHash = (BigInt(`0x${bot.id.replace(/-/g, "").slice(0, 8)}`) % 900000n) + 100000n;
  const scopedUpdateId = String(botHash * 10_000_000_000n + BigInt(update.update_id));
  await supabase.from("telegram_messages").upsert({
    update_id: scopedUpdateId,
    chat_id: msg.chat.id,
    text: msg.text ?? msg.caption ?? null,
    raw_update: { ...update, _system_bot_id: bot.id },
    bot_id: bot.id,
    processed: true,
    processed_at: new Date().toISOString(),
  }, { onConflict: "update_id" }).then(() => null).catch(() => null);
}

async function deleteWebhook(token: string) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    return { error: String(e) };
  }
}

async function generateChatLinkCode(chatId: number, kind: "expenses" | "reports", secret: string, now = Date.now()): Promise<string> {
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
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let n = value;
  let code = "";
  for (let i = 0; i < 6; i++) {
    code = alphabet[Number(n % BigInt(alphabet.length))] + code;
    n /= BigInt(alphabet.length);
  }
  return code;
}

async function processBot(
  supabase: any,
  bot: { id: string; token: string; bot_username: string | null; update_offset: number },
  budgetMs: number,
) {
  const startedAt = Date.now();
  let currentOffset = bot.update_offset || 0;
  let totalProcessed = 0;
  let recovered = false;

  while (true) {
    const remainingMs = budgetMs - (Date.now() - startedAt);
    if (remainingMs < MIN_REMAINING_MS) break;
    const timeout = Math.min(25, Math.max(1, Math.floor(remainingMs / 1000) - 5));
    if (timeout < 1) break;

    let r: Response;
    try {
      r = await fetch(`https://api.telegram.org/bot${bot.token}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: currentOffset, timeout, allowed_updates: ["message"] }),
      });
    } catch (e) {
      console.error(`[reports-poll] getUpdates fetch error for bot=${bot.id}`, e);
      break;
    }

    const data = await r.json().catch(() => ({} as any));

    const is409 =
      r.status === 409 ||
      (data?.error_code === 409) ||
      (typeof data?.description === "string" && data.description.includes("terminated by other getUpdates"));

    if (!r.ok || data?.ok === false) {
      if (is409 && !recovered) {
        console.warn(`[reports-poll] bot=${bot.id} 409 — clearing webhook and retrying`);
        const rec = await deleteWebhook(bot.token);
        console.warn(`[reports-poll] deleteWebhook result bot=${bot.id}`, rec);
        recovered = true;
        continue;
      }
      if (is409) {
        console.warn(`[reports-poll] bot=${bot.id} 409 after recovery — skipping`);
        break;
      }
      // 401 unauthorized → token invalid; mark as such
      if (r.status === 401) {
        await supabase
          .from("system_telegram_bots")
          .update({ validation_status: "invalid", last_validated_at: new Date().toISOString() })
          .eq("id", bot.id);
      }
      console.error(`[reports-poll] bot=${bot.id} getUpdates failed`, r.status, data);
      break;
    }


    const updates = data.result ?? [];
    if (updates.length === 0) break; // long-poll returned empty → stop this bot for this run

    for (const u of updates) {
      const msg = u.message;
      if (!msg) continue;
      const chatId = msg.chat.id;
      const text = (msg.text ?? "").trim();
      await saveIncomingMessage(supabase, u, bot);

      const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})\s*$/);
      const codeMatch = text.match(/^\/c(?:ode|odigo|ódigo)?(?:@\w+)?\s*$/i);

      if (startMatch) {
        const code = startMatch[1];
        const { data: reportCodeRow, error: reportCodeErr } = await supabase
          .from("telegram_reports_link_codes")
          .select("id, user_id, expires_at, bot_id").eq("code", code).eq("bot_id", bot.id).maybeSingle();
        if (reportCodeErr) {
          await tgSend(bot.token, chatId, "❌ Estrutura de dupla conexão ausente. Peça ao administrador para restaurar as tabelas de relatórios.");
          totalProcessed++;
          continue;
        }
        const codeRow = reportCodeRow;
        if (!codeRow) {
          await tgSend(bot.token, chatId, "❌ Código inválido ou expirado. Gere um novo no app.");
        } else if (new Date((codeRow as any).expires_at).getTime() < Date.now()) {
          await tgSend(bot.token, chatId, "⌛ Código expirado. Gere um novo no app.");
          await supabase.from("telegram_reports_link_codes").delete().eq("id", (codeRow as any).id);
        } else {
          const linkPayload = {
            user_id: (codeRow as any).user_id,
            chat_id: chatId,
            bot_id: bot.id,
            label: bot.bot_username ? `@${bot.bot_username}` : null,
          };
          await supabase.from("telegram_reports_links").delete()
            .or(`chat_id.eq.${chatId},user_id.eq.${(codeRow as any).user_id}`)
            .eq("bot_id", bot.id);
          await supabase.from("telegram_reports_links").insert(linkPayload);
          await supabase.from("telegram_reports_link_codes").delete()
            .eq("user_id", (codeRow as any).user_id).eq("bot_id", bot.id);
          await tgSend(bot.token, chatId, "✅ *Bot de Relatórios conectado!*\n\nVocê receberá os relatórios nos horários configurados.");
        }
      } else if (codeMatch) {
        const botCode = await generateChatLinkCode(chatId, "reports", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await supabase.from("telegram_messages")
          .update({ raw_update: { ...u, _system_bot_id: bot.id, _bot_link_code: botCode, _bot_link_kind: "reports" } })
          .eq("bot_id", bot.id)
          .eq("raw_update->>update_id", String(u.update_id))
          .then(() => null).catch(() => null);
        await tgSend(
          bot.token, chatId,
          `🔑 *Seu código de vínculo:*\n\n\`${botCode}\`\n\n` +
            `1. Abra o app\n2. Vá em *Configurações → Bots do Telegram*\n` +
            `3. Cole este código no campo *"Tenho um código"*\n\n` +
            `_Válido por 15 min._`,
        );
      } else if (text === "/start" || text === "/help") {
        await tgSend(bot.token, chatId,
          "👋 Este é o *Bot de Relatórios*.\n\nEnvie /code aqui para gerar um código de vínculo e cole no app.");
      }

      totalProcessed++;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    currentOffset = newOffset;
    await supabase
      .from("system_telegram_bots")
      .update({ update_offset: newOffset, last_polled_at: new Date().toISOString() })
      .eq("id", bot.id);
  }

  return totalProcessed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const EXPENSES_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const REPORTS_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS") ?? "";
  const supabase = getExternalAdmin();

  // Concurrency guard: if another invocation logged a run < 15s ago and we're not
  // forced, skip silently to prevent overlapping getUpdates → 409 noise.
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force) {
    const { data: recent } = await supabase
      .from("telegram_job_logs")
      .select("created_at")
      .eq("job", "telegram-reports-poll")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastTs = recent?.[0]?.created_at ? new Date(recent[0].created_at as string).getTime() : 0;
    const sinceLastMs = Date.now() - lastTs;
    if (lastTs && sinceLastMs < 15_000) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "recent run in flight", sinceLastMs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Load all active GLOBAL reports bots (system-wide, shared by all accounts)
  const { data: bots, error } = await supabase
    .from("system_telegram_bots")
    .select("id, token, bot_username, update_offset, purpose, active")
    .eq("active", true)
    .eq("purpose", "reports");

  if (error) {
    console.error("[reports-poll] failed to list bots", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const list = ((bots ?? []) as any[]).filter((bot) => {
    if (EXPENSES_BOT_TOKEN && bot.token === EXPENSES_BOT_TOKEN) return false;
    return true;
  });
  if (list.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, bots: 0, note: "no active reports bots with reports token" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Split runtime budget across all bots so the function fits in Edge limits
  const perBotBudget = Math.max(8_000, Math.floor((MAX_RUNTIME_MS - 2_000) / list.length));
  let total = 0;
  const errors: { bot_id: string; error: string }[] = [];
  for (const b of list) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < MIN_REMAINING_MS) break;
    const budget = Math.min(perBotBudget, remaining);
    try {
      total += await processBot(supabase, b, budget);
      await supabase.from("system_telegram_bots")
        .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
        .eq("id", b.id);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error(`[reports-poll] processBot failed for ${b.id}`, e);
      errors.push({ bot_id: b.id, error: msg });
      await supabase.from("system_telegram_bots")
        .update({ last_error: msg, last_error_at: new Date().toISOString() })
        .eq("id", b.id);
    }
  }

  await supabase.from("telegram_job_logs").insert({
    job: "telegram-reports-poll",
    ok: errors.length === 0,
    processed: total,
    duration_ms: Date.now() - startTime,
    error: errors.length ? errors.map((e) => `${e.bot_id}: ${e.error}`).join(" | ") : null,
    details: { bots: list.length, errors },
  }).then(() => null).catch(() => null);

  return new Response(JSON.stringify({ ok: errors.length === 0, processed: total, bots: list.length, errors }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
