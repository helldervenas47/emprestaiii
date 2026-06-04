import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://api.telegram.org";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { owner_id, display_name, email } = await req.json();
    if (!owner_id) {
      return new Response(JSON.stringify({ error: "owner_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const TELEGRAM_API_KEY = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      // Telegram not configured — skip silently
      return new Response(JSON.stringify({ ok: true, skipped: "telegram_not_configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Find admin's Telegram chat from telegram_links (bot used to register expenses)
    // OR telegram_reports_links (reports bot). Prefer reports bot since it's the admin/notifier channel.
    const { data: reportsLink } = await supabase
      .from("telegram_reports_links")
      .select("chat_id")
      .eq("user_id", owner_id)
      .maybeSingle();

    const { data: mainLink } = await supabase
      .from("telegram_links")
      .select("chat_id")
      .eq("user_id", owner_id)
      .maybeSingle();

    const chatId = reportsLink?.chat_id || mainLink?.chat_id;

    if (!chatId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_telegram_link" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text =
      `🔔 <b>Novo cadastro aguardando aprovação</b>\n\n` +
      `👤 <b>Nome:</b> ${display_name || "(sem nome)"}\n` +
      `📧 <b>Email:</b> ${email || "(sem email)"}\n\n` +
      `Acesse o app e abra o sino de aprovações no topo para aprovar ou rejeitar.`;

    const tgRes = await fetch(`${GATEWAY_URL}/bot${telegramKey}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });

    const tgData = await tgRes.json();
    if (!tgRes.ok) {
      console.error("Telegram send failed", tgRes.status, tgData);
      return new Response(JSON.stringify({ ok: false, error: tgData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("notify-approval-request error", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
