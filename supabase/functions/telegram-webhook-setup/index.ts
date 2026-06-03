import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!TELEGRAM_API_KEY) {
      throw new Error("TELEGRAM_API_KEY not configured");
    }
    if (!SUPABASE_URL) {
      throw new Error("SUPABASE_URL not configured");
    }
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const secretToken = await deriveTelegramWebhookSecret(TELEGRAM_API_KEY);
    const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;


    const response = await fetch("https://connector-gateway.lovable.dev/telegram/setWebhook", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secretToken,
        allowed_updates: ["message", "edited_message"],
        drop_pending_updates: true,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({ ok: true, webhook_url: webhookUrl, result: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Setup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
