// One-shot utility to clear any active webhook on the Telegram bots,
// which is the typical cause of getUpdates 409 "terminated by other getUpdates" errors.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

async function clearBot(label: string, telegramKey: string | undefined, lovableKey: string) {
  if (!telegramKey) return { label, skipped: "missing-key" };

  // 1) Inspect current webhook
  const infoRes = await fetch(`${GATEWAY}/getWebhookInfo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const info = await infoRes.json().catch(() => ({}));

  // 2) Delete webhook + drop pending updates to release getUpdates lock
  const delRes = await fetch(`${GATEWAY}/deleteWebhook`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ drop_pending_updates: false }),
  });
  const del = await delRes.json().catch(() => ({}));

  // 3) Identify the bot
  const meRes = await fetch(`${GATEWAY}/getMe`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": telegramKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const me = await meRes.json().catch(() => ({}));

  return { label, me: me?.result?.username ?? null, webhookInfo: info?.result ?? info, deleteWebhook: del };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;
  const k1 = Deno.env.get("TELEGRAM_API_KEY_1");
  const k2 = Deno.env.get("TELEGRAM_API_KEY_2");

  const results = await Promise.all([
    clearBot("TELEGRAM_API_KEY_1 (reports bot)", k1, lovableKey),
    clearBot("TELEGRAM_API_KEY_2 (commands bot)", k2, lovableKey),
  ]);

  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
