// Configura automaticamente:
//  - Bot de DESPESAS (TELEGRAM_BOT_TOKEN): webhook -> /functions/v1/telegram-webhook
//  - Bot de RELATÓRIOS (TELEGRAM_BOT_TOKEN_REPORTS): deleteWebhook (usa polling/cron)
// Registra resultado em public.telegram_job_logs e em system_telegram_bots.last_*.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function maskToken(token: string) {
  const parts = token.split(":");
  if (parts.length !== 2) return "bot_token";
  return `${parts[0]}:****${parts[1].slice(-4)}`;
}

async function tgGetMe(token: string) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  return await r.json().catch(() => ({}));
}

async function telegramPostForm(token: string, method: string, params: Record<string, string | boolean | string[]>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    body.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok && data?.ok !== false, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const results: any[] = [];

  async function logRun(ok: boolean, error: string | null, details: any) {
    await supabase.from("telegram_job_logs").insert({
      job: "telegram-webhook-setup",
      ok, error,
      processed: results.length,
      duration_ms: Date.now() - startedAt,
      details,
    }).then(() => null).catch(() => null);
  }

  try {
    const expensesToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const reportsToken = Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS");
    const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

    // 1) DESPESAS -> setWebhook
    if (expensesToken) {
      const me = await tgGetMe(expensesToken);
      const username = me?.result?.username ?? null;
      const botId = me?.result?.id ? String(me.result.id) : null;
      // Sync token into DB so polling/processing uses the new token.
      if (username && botId) {
        await supabase.from("system_telegram_bots").upsert({
          purpose: "expenses",
          token: expensesToken,
          bot_username: username,
          telegram_bot_id: botId,
          active: true,
          validation_status: "valid",
          last_validated_at: new Date().toISOString(),
          update_offset: 0,
        }, { onConflict: "purpose" });
      }
      const secret = await deriveTelegramWebhookSecret(expensesToken);
      const { ok: setOk, data } = await telegramPostForm(expensesToken, "setWebhook", {
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message", "edited_message", "callback_query"],
        drop_pending_updates: false,
      });
      results.push({ kind: "expenses", action: "setWebhook", token: maskToken(expensesToken), ok: setOk, telegram: data, username });
      if (username) {
        await supabase.from("system_telegram_bots")
          .update({ last_success_at: new Date().toISOString(), last_error: null, last_error_at: null })
          .eq("purpose", "expenses").eq("bot_username", username);
      }
    } else {
      results.push({ kind: "expenses", skipped: true, reason: "TELEGRAM_BOT_TOKEN ausente" });
    }

    // 2) RELATÓRIOS -> deleteWebhook (usa polling/cron)
    if (reportsToken) {
      const me = await tgGetMe(reportsToken);
      const username = me?.result?.username ?? null;
      const botId = me?.result?.id ? String(me.result.id) : null;
      if (username && botId) {
        await supabase.from("system_telegram_bots").upsert({
          purpose: "reports",
          token: reportsToken,
          bot_username: username,
          telegram_bot_id: botId,
          active: true,
          validation_status: "valid",
          last_validated_at: new Date().toISOString(),
          update_offset: 0,
        }, { onConflict: "purpose" });
      }
      const { ok: deleteOk, data } = await telegramPostForm(reportsToken, "deleteWebhook", {
        drop_pending_updates: false,
      });
      results.push({ kind: "reports", action: "deleteWebhook", token: maskToken(reportsToken), ok: deleteOk, telegram: data, username });
    } else {
      results.push({ kind: "reports", skipped: true, reason: "TELEGRAM_BOT_TOKEN_REPORTS ausente" });
    }


    const ok = results.every((r) => r.skipped || r.ok);
    await logRun(ok, ok ? null : "alguma operação falhou", { webhook_url: webhookUrl, results });

    return new Response(JSON.stringify({ ok, webhook_url: webhookUrl, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    await logRun(false, e?.message ?? "setup failed", { results });
    return new Response(JSON.stringify({ error: e?.message ?? "Setup failed", results }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
