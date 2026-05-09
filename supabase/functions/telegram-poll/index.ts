import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";
// Keep below the cron interval (≈60s) so consecutive invocations don't overlap
// and trigger 409 "terminated by other getUpdates" errors.
const MAX_RUNTIME_MS = 40_000;
const MIN_REMAINING_MS = 5_000;
// Short cooldown — 409 usually means another in-flight poll, just let the next
// cron tick retry instead of blocking polling for 10 minutes.
const RECOVERY_COOLDOWN_MS = 30_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Try to clear any active webhook on the bot. Returns true if Telegram accepted it.
async function deleteWebhook(lovableKey: string, telegramKey: string): Promise<{ ok: boolean; info: any }> {
  try {
    const r = await fetch(`${GATEWAY_URL}/deleteWebhook`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": telegramKey,
        "Content-Type": "application/json",
      },
      // Keep pending updates so we don't lose user messages during recovery.
      body: JSON.stringify({ drop_pending_updates: false }),
    });
    const info = await r.json().catch(() => ({}));
    return { ok: r.ok && info?.ok !== false, info };
  } catch (e) {
    return { ok: false, info: { error: String(e) } };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startTime = Date.now();
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Missing env" }), { status: 500, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: state, error: stateErr } = await supabase
    .from("telegram_bot_state")
    .select("update_offset, last_webhook_recovery_at, webhook_recovery_count")
    .eq("id", 1)
    .single();
  if (stateErr) return new Response(JSON.stringify({ error: stateErr.message }), { status: 500, headers: corsHeaders });

  let currentOffset: number = (state as any).update_offset;
  let lastRecoveryAt: number = (state as any).last_webhook_recovery_at
    ? new Date((state as any).last_webhook_recovery_at).getTime()
    : 0;
  let recoveriesThisRun = 0;
  let totalProcessed = 0;
  let hasNew = false;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;
    // Cap each long-poll well under runtime budget so we always finish cleanly.
    const timeout = Math.min(20, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const resp = await fetch(`${GATEWAY_URL}/getUpdates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ offset: currentOffset, timeout, allowed_updates: ["message", "callback_query"] }),
    });

    const data = await resp.json().catch(() => ({}));

    // ---------- Auto-recovery: handle 409 Conflict (webhook left active) ----------
    // Telegram returns either HTTP 409 directly or a body { ok:false, error_code:409, ... }.
    const is409 =
      resp.status === 409 ||
      data?.error_code === 409 ||
      (typeof data?.description === "string" && data.description.includes("terminated by other getUpdates"));

    if (!resp.ok || data?.ok === false) {
      if (is409) {
        const sinceLast = Date.now() - lastRecoveryAt;
        if (recoveriesThisRun < 1 && sinceLast > RECOVERY_COOLDOWN_MS) {
          console.warn("getUpdates 409 detected — attempting auto-recovery via deleteWebhook");
          const rec = await deleteWebhook(LOVABLE_API_KEY, TELEGRAM_API_KEY);
          recoveriesThisRun++;
          lastRecoveryAt = Date.now();
          await supabase
            .from("telegram_bot_state")
            .update({
              last_webhook_recovery_at: new Date(lastRecoveryAt).toISOString(),
              webhook_recovery_count: ((state as any).webhook_recovery_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", 1);
          console.warn("auto-recovery result", rec);
          // Whether or not delete succeeded, retry the loop. If the cause is
          // another running poller (not a webhook), the next 409 will simply
          // hit the cooldown and exit gracefully.
          continue;
        }
        console.error("getUpdates 409 — recovery cooldown active, giving up this run", { sinceLast });
        return new Response(JSON.stringify({ error: data, recovery: "cooldown" }), { status: 409, headers: corsHeaders });
      }

      console.error("getUpdates failed", data);
      return new Response(JSON.stringify({ error: data }), { status: 502, headers: corsHeaders });
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    const rows = updates
      .map((u: any) => {
        if (u.message) {
          return {
            update_id: u.update_id,
            chat_id: u.message.chat.id,
            text: u.message.text ?? u.message.caption ?? null,
            raw_update: u,
          };
        }
        if (u.callback_query?.message?.chat?.id) {
          return {
            update_id: u.update_id,
            chat_id: u.callback_query.message.chat.id,
            text: null,
            raw_update: u,
          };
        }
        return null;
      })
      .filter((r: any) => r !== null);

    if (rows.length > 0) {
      const { error: insertErr } = await supabase
        .from("telegram_messages").upsert(rows, { onConflict: "update_id" });
      if (insertErr) return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: corsHeaders });
      totalProcessed += rows.length;
      hasNew = true;
    }

    const newOffset = Math.max(...updates.map((u: any) => u.update_id)) + 1;
    await supabase.from("telegram_bot_state")
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq("id", 1);
    currentOffset = newOffset;
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

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed, recoveries: recoveriesThisRun }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
