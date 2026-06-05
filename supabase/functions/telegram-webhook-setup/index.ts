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
      const secret = await deriveTelegramWebhookSecret(expensesToken);
      const r = await fetch(`https://api.telegram.org/bot${expensesToken}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secret,
          allowed_updates: ["message", "edited_message"],
          drop_pending_updates: true,
        }),
      });
      const data = await r.json().catch(() => ({}));
      const me = await tgGetMe(expensesToken);
      const username = me?.result?.username ?? null;
      results.push({ kind: "expenses", action: "setWebhook", token: maskToken(expensesToken), ok: r.ok && data?.ok !== false, telegram: data, username });
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
      const r = await fetch(`https://api.telegram.org/bot${reportsToken}/deleteWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drop_pending_updates: false }),
      });
      const data = await r.json().catch(() => ({}));
      const me = await tgGetMe(reportsToken);
      const username = me?.result?.username ?? null;
      results.push({ kind: "reports", action: "deleteWebhook", token: maskToken(reportsToken), ok: r.ok && data?.ok !== false, telegram: data, username });
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
