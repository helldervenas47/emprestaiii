import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function maskToken(token: string) {
  const parts = token.split(":");
  if (parts.length !== 2) return "bot_token";
  return `${parts[0]}:****${parts[1].slice(-4)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");

    // Tokens a configurar (Expenses e Reports)
    const tokens = [
      Deno.env.get("TELEGRAM_BOT_TOKEN"),
      Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS"),
    ].filter(Boolean) as string[];

    if (tokens.length === 0) {
      throw new Error("Nenhum bot token configurado (TELEGRAM_BOT_TOKEN ou TELEGRAM_BOT_TOKEN_REPORTS)");
    }

    const results = [];
    const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

    for (const token of tokens) {
      const secretToken = await deriveTelegramWebhookSecret(token);
      
      const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          secret_token: secretToken,
          allowed_updates: ["message", "edited_message"],
          drop_pending_updates: true,
        }),
      });

      const data = await response.json();
      results.push({ token: maskToken(token), ok: response.ok, result: data });
    }

    return new Response(JSON.stringify({ 
      ok: results.every(r => r.ok), 
      webhook_url: webhookUrl, 
      results 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "Setup failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
