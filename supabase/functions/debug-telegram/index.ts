import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: bots1 } = await supabase.from("system_telegram_bots").select("*");
  const { data: bots2 } = await supabase.from("telegram_bots").select("*");

  return new Response(JSON.stringify({ system_telegram_bots: bots1, telegram_bots: bots2 }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
