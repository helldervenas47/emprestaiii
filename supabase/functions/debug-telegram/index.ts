import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Auto-populate system_telegram_bots if empty
  const { data: currentBots } = await supabase.from("system_telegram_bots").select("id");
  if (!currentBots || currentBots.length === 0) {
    const expensesToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const reportsToken = Deno.env.get("TELEGRAM_BOT_TOKEN_REPORTS");
    
    if (expensesToken) {
      await supabase.from("system_telegram_bots").insert({
        name: "Bot de Despesas",
        token: expensesToken,
        purpose: "expenses",
        active: true
      });
    }
    
    if (reportsToken) {
      await supabase.from("system_telegram_bots").insert({
        name: "Bot de Relatórios",
        token: reportsToken,
        purpose: "reports",
        active: true
      });
    }
  }

  const { data: bots } = await supabase.from("system_telegram_bots").select("*");
  const { data: userCodes } = await supabase.from("telegram_link_codes").select("*");
  const { data: reportCodes } = await supabase.from("telegram_reports_link_codes").select("*");

  return new Response(JSON.stringify({ bots, userCodes, reportCodes }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
