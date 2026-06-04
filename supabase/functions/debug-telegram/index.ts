import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: bots } = await supabase.from("system_telegram_bots").select("*");
  const { data: messages } = await supabase.from("telegram_messages").select("*").order("created_at", { descending: true }).limit(5);

  return new Response(JSON.stringify({ bots, messages }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
