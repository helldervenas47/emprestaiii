import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: userErr } = await userClient.auth.getUser(token);
    const userId = user?.id;
    if (userErr || !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing } = await admin.from("telegram_reports_links")
    .select("chat_id").eq("user_id", userId).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ alreadyLinked: true, chat_id: existing.chat_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("telegram_reports_link_codes").delete().eq("user_id", userId);

  let code = "";
  for (let i = 0; i < 5; i++) {
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const { data: clash } = await admin.from("telegram_reports_link_codes").select("id").eq("code", code).maybeSingle();
    if (!clash) break;
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error: insErr } = await admin.from("telegram_reports_link_codes").insert({
    code, user_id: userId, expires_at: expiresAt,
  });
  if (insErr) return new Response(JSON.stringify({ error: insErr.message }), { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ code, expiresAt }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
