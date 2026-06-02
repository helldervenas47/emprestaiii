import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: bots } = await supabase.from("system_telegram_bots").select("*");
  const { data: codes } = await supabase.from("telegram_bots").select("*");
  const { data: messages } = await supabase.from("telegram_messages").select("*").eq("processed", false).limit(5);

  return new Response(JSON.stringify({ 
    bots: bots?.map(b => ({ id: b.id, purpose: b.purpose, active: b.active, hasToken: !!b.token })),
    activeCodes: codes,
    unprocessedMessages: messages?.length
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
