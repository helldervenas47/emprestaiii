import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

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
        console.warn(`[reports-poll] bot=${bot.id} 409 — clearing webhook`);
        await deleteWebhook(bot.token);
        recovered = true;
        continue;
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

      const startMatch = text.match(/^\/start(?:@\w+)?\s+(\d{6})\s*$/);
      const codeMatch = text.match(/^\/c(?:ode|odigo|ódigo)?(?:@\w+)?\s*$/i);

      if (startMatch) {
        const code = startMatch[1];
        const { data: codeRow } = await supabase
          .from("telegram_reports_link_codes")
          .select("user_id, expires_at").eq("code", code).maybeSingle();
        if (!codeRow) {
          await tgSend(bot.token, chatId, "❌ Código inválido ou expirado. Gere um novo no app.");
        } else if (new Date((codeRow as any).expires_at).getTime() < Date.now()) {
          await tgSend(bot.token, chatId, "⌛ Código expirado. Gere um novo no app.");
          await supabase.from("telegram_reports_link_codes").delete().eq("code", code);
        } else {
          await supabase.from("telegram_reports_links").upsert(
            { user_id: (codeRow as any).user_id, chat_id: chatId, label: bot.bot_username ? `@${bot.bot_username}` : null },
            { onConflict: "user_id" },
          );
          await supabase.from("telegram_reports_link_codes").delete().eq("user_id", (codeRow as any).user_id);
          await tgSend(bot.token, chatId, "✅ *Bot de Relatórios conectado!*\n\nVocê receberá os relatórios nos horários configurados.");
        }
      } else if (codeMatch) {
        // Generate a short bot_code that the user pastes back into the app
        await supabase.from("telegram_bots").delete().eq("kind", "reports").eq("chat_id", chatId);
        let botCode = "";
        for (let i = 0; i < 6; i++) {
          botCode = Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (botCode.length === 6) {
            const { data: clash } = await supabase
              .from("telegram_bots").select("id").eq("bot_code", botCode).maybeSingle();
            if (!clash) break;
          }
        }
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        const { error: insErr } = await supabase.from("telegram_bots").insert({
          bot_code: botCode, kind: "reports", chat_id: chatId, expires_at: expiresAt,
        });
        if (insErr) {
          console.error("[reports-poll] insert telegram_bots failed", insErr);
          await tgSend(bot.token, chatId, "⚠️ Não consegui gerar o código agora. Tente novamente em instantes.");
        } else {
          await tgSend(
            bot.token, chatId,
            `🔑 *Seu código de vínculo:*\n\n\`${botCode}\`\n\n` +
              `1. Abra o app\n2. Vá em *Configurações → Bots do Telegram*\n` +
              `3. Cole este código no campo *"Tenho um código"*\n\n` +
              `_Válido por 15 min._`,
          );
        }
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

Deno.serve(async () => {
  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Load all active reports bots registered by users
  const { data: bots, error } = await supabase
    .from("user_telegram_bots")
    .select("id, token, owner_id, bot_username, update_offset, purpose, active")
    .eq("active", true)
    .in("purpose", ["reports", "general"]);

  if (error) {
    console.error("[reports-poll] failed to list bots", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const list = (bots ?? []) as any[];
  if (list.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, bots: 0, note: "no active reports bots" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Split runtime budget across all bots so the function fits in Edge limits
  const perBotBudget = Math.max(8_000, Math.floor((MAX_RUNTIME_MS - 2_000) / list.length));
  let total = 0;
  for (const b of list) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < MIN_REMAINING_MS) break;
    const budget = Math.min(perBotBudget, remaining);
    try {
      total += await processBot(supabase, b, budget);
    } catch (e) {
      console.error(`[reports-poll] processBot failed for ${b.id}`, e);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: total, bots: list.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
