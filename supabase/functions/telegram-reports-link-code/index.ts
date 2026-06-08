import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getReportsBotId } from "../_shared/reports-bot.ts";
import { getExternalAdmin, getExternalUserClient } from "../_shared/external-supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const userClient = getExternalUserClient();
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
  const userId = user?.id;
  if (userErr || !userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
  }

  const admin = getExternalAdmin();
  const reportsBotId = await getReportsBotId(admin);
  if (!reportsBotId) {
    return new Response(JSON.stringify({ error: "Bot de relatórios não configurado." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: existing } = await admin.from("telegram_links")
    .select("chat_id").eq("user_id", userId).eq("bot_id", reportsBotId).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ alreadyLinked: true, chat_id: existing.chat_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("telegram_link_codes").delete().eq("user_id", userId).eq("bot_id", reportsBotId);

  let code = "";
  for (let i = 0; i < 5; i++) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const { data: clash } = await admin.from("telegram_link_codes").select("id").eq("code", code).maybeSingle();
    if (!clash) break;
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error: insErr } = await admin.from("telegram_link_codes").insert({
    code, user_id: userId, bot_id: reportsBotId, expires_at: expiresAt,
  });
  if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ code, expiresAt }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
