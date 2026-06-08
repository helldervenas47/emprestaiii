import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

async function deriveTelegramWebhookSecret(telegramApiKey: string): Promise<string> {
  const data = new TextEncoder().encode(`telegram-webhook:${telegramApiKey}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeEqual(a: string | null, b: string): boolean {
  if (!a) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const tokens = [
      Deno.env.get("TELEGRAM_BOT_TOKEN"),
      Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS"),
    ].filter(Boolean) as string[];

    if (tokens.length === 0) {
      throw new Error("Nenhum TELEGRAM_BOT_TOKEN configurado");
    }

    const actualSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    let authenticated = false;
    let matchedToken: string | null = null;

    for (const token of tokens) {
      const expectedSecret = await deriveTelegramWebhookSecret(token);
      if (safeEqual(actualSecret, expectedSecret)) {
        authenticated = true;
        matchedToken = token;
        break;
      }
    }

    if (!authenticated) {
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SUPABASE_URL) throw new Error("SUPABASE_URL not configured");

    const { getExternalAdmin } = await import("../_shared/external-supabase.ts");
    const supabase = getExternalAdmin();
    const update = await req.json();
    const message = update.message ?? update.edited_message;

    if (!message?.chat?.id || typeof update.update_id !== "number") {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: systemBot } = matchedToken
      ? await supabase
        .from("system_telegram_bots")
        .select("id")
        .eq("token", matchedToken)
        .eq("active", true)
        .order("bot_id", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      : { data: null };
    const botId = (systemBot as any)?.id ?? null;

    // Store message for async processing. Keep payload aligned with the live
    // telegram_messages schema: it has bot_id, but no Telegram sender user_id.
    const rawUpdate = botId ? { ...update, _system_bot_id: botId } : update;
    const { error } = await supabase.from("telegram_messages").upsert(
      {
        update_id: update.update_id,
        chat_id: message.chat.id,
        text: message.text ?? null,
        raw_update: rawUpdate,
        bot_id: botId,
        processed: false,
      },
      { onConflict: "update_id" },
    );

    if (error) {
      console.error("[telegram-webhook] upsert failed", error);
      await supabase.from("telegram_job_logs").insert({
        job: "telegram-webhook", ok: false, error: error.message,
        details: { update_id: update.update_id, chat_id: message.chat.id },
      }).then(() => null).catch(() => null);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("telegram_job_logs").insert({
      job: "telegram-webhook", ok: true, processed: 1,
      details: { update_id: update.update_id, chat_id: message.chat.id, has_text: !!message.text },
    }).then(() => null).catch(() => null);

    // Immediately trigger async processing
    fetch(`${SUPABASE_URL}/functions/v1/telegram-process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch((e) => console.error("[telegram-webhook] process trigger failed", e));

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[telegram-webhook] error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
