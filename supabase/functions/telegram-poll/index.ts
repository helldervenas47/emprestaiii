import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Keep below the cron interval (≈60s) so consecutive invocations don't overlap
// and trigger 409 "terminated by other getUpdates" errors.
const MAX_RUNTIME_MS = 40_000;
const MIN_REMAINING_MS = 5_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ExpenseBot = {
  id: string;
  token: string;
  bot_username: string | null;
  update_offset: number;
};

async function deleteWebhook(token: string): Promise<{ ok: boolean; info: any }> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const info = await r.json().catch(() => ({}));
    return { ok: r.ok && info?.ok !== false, info };
  } catch (e) {
    return { ok: false, info: { error: String(e) } };
  }
}

async function processBot(supabase: any, bot: ExpenseBot, budgetMs: number) {
  const startedAt = Date.now();
  let currentOffset = Number(bot.update_offset || 0);
  let recovered = false;
  let totalProcessed = 0;
  let hasNew = false;

  while (true) {
    const remainingMs = budgetMs - (Date.now() - startedAt);
    if (remainingMs < MIN_REMAINING_MS) break;
    const timeout = Math.min(20, Math.max(1, Math.floor(remainingMs / 1000) - 5));
    if (timeout < 1) break;

    let resp: Response;
    try {
      resp = await fetch(`https://api.telegram.org/bot${bot.token}/getUpdates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset: currentOffset, timeout, allowed_updates: ["message", "callback_query"] }),
      });
    } catch (e) {
      console.error(`[telegram-poll] getUpdates fetch error bot=${bot.id}`, e);
      break;
    }

    const data = await resp.json().catch(() => ({}));
    const is409 =
      resp.status === 409 ||
      data?.error_code === 409 ||
      (typeof data?.description === "string" && data.description.includes("terminated by other getUpdates"));

    if (!resp.ok || data?.ok === false) {
      if (is409 && !recovered) {
        console.warn(`[telegram-poll] bot=${bot.id} 409 — limpando webhook e tentando novamente`);
        const rec = await deleteWebhook(bot.token);
        console.warn(`[telegram-poll] deleteWebhook result bot=${bot.id}`, rec);
        recovered = true;
        continue;
      }
      if (resp.status === 401) {
        await supabase
          .from("system_telegram_bots")
          .update({ validation_status: "invalid", last_validated_at: new Date().toISOString() })
          .eq("id", bot.id);
      }
      console.error(`[telegram-poll] bot=${bot.id} getUpdates failed`, resp.status, data);
      break;
    }

    const updates = data.result ?? [];
    if (updates.length === 0) break;

    const rows = updates
      .map((u: any) => {
        if (u.message) {
          const rawUpdate = { ...u, _system_bot_id: bot.id };
          return {
            update_id: u.update_id,
            chat_id: u.message.chat.id,
            text: u.message.text ?? u.message.caption ?? null,
            raw_update: rawUpdate,
          };
        }
        if (u.callback_query?.message?.chat?.id) {
          const rawUpdate = { ...u, _system_bot_id: bot.id };
          return {
            update_id: u.update_id,
            chat_id: u.callback_query.message.chat.id,
            text: null,
            raw_update: rawUpdate,
          };
        }
        return null;
      })
      .filter((r: any) => r !== null);

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from("telegram_messages")
        .upsert(rows, { onConflict: "update_id" });
      if (insertErr) throw new Error(insertErr.message);
      totalProcessed += rows.length;
      hasNew = true;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    currentOffset = newOffset;
    await supabase
      .from("system_telegram_bots")
      .update({ update_offset: newOffset, last_polled_at: new Date().toISOString() })
      .eq("id", bot.id);
  }

  return { processed: totalProcessed, hasNew };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing env" }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: bots, error: botsErr } = await supabase
    .from("system_telegram_bots")
    .select("id, token, bot_username, update_offset")
    .eq("active", true)
    .eq("purpose", "expenses")
    .order("created_at", { ascending: true });

  if (botsErr) {
    console.error("[telegram-poll] failed to list expense bots", botsErr);
    return new Response(JSON.stringify({ error: botsErr.message }), { status: 500, headers: corsHeaders });
  }

  const list = (bots ?? []) as ExpenseBot[];
  if (list.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, bots: 0, note: "no active expense bots" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let totalProcessed = 0;
  let hasNew = false;

  const perBotBudget = Math.max(8_000, Math.floor((MAX_RUNTIME_MS - 2_000) / list.length));
  for (const bot of list) {
    const remaining = MAX_RUNTIME_MS - (Date.now() - startTime);
    if (remaining < MIN_REMAINING_MS) break;
    try {
      const result = await processBot(supabase, bot, Math.min(perBotBudget, remaining));
      totalProcessed += result.processed;
      hasNew = hasNew || result.hasNew;
    } catch (e) {
      console.error(`[telegram-poll] processBot failed bot=${bot.id}`, e);
    }
  }

  // Trigger processor (fire-and-forget) if we got new messages.
  if (hasNew) {
    const triggerPromise = fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }).catch((e) => console.error("trigger process failed", e));
    // @ts-ignore - EdgeRuntime is available in Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(triggerPromise);
    }
  }

  // Self re-trigger to eliminate the ~20s gap between cron cycles (cron is 1/min,
  // each run lasts ≈40s). This keeps long-polling effectively continuous so
  // messages are picked up within ~1s instead of waiting up to 20s.
  const selfTrigger = fetch(`${SUPABASE_URL}/functions/v1/telegram-poll`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  }).catch((e) => console.error("self re-trigger failed", e));
  // @ts-ignore
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(selfTrigger);
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed, bots: list.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
