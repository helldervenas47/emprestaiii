import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXTERNAL_URL = Deno.env.get("EXTERNAL_SUPABASE_URL");
const EXTERNAL_KEY = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
const INTERNAL_URL = Deno.env.get("SUPABASE_URL");
const INTERNAL_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req) => {
  try {
    const ext = createClient(EXTERNAL_URL!, EXTERNAL_KEY!);
    const int = createClient(INTERNAL_URL!, INTERNAL_KEY!);

    // Check system_telegram_bots
    const { data: extBots } = await ext.from("system_telegram_bots").select("id, bot_username, updated_at").order("updated_at", { ascending: false }).limit(5);
    const { data: intBots } = await int.from("system_telegram_bots").select("id, bot_username, updated_at").order("updated_at", { ascending: false }).limit(5);

    // Check telegram_job_logs
    const { data: extLogs } = await ext.from("telegram_job_logs").select("id, job, created_at").order("created_at", { ascending: false }).limit(5);
    const { data: intLogs } = await int.from("telegram_job_logs").select("id, job, created_at").order("created_at", { ascending: false }).limit(5);

    return new Response(JSON.stringify({
      external: {
        bots: extBots,
        logs: extLogs
      },
      internal: {
        bots: intBots,
        logs: intLogs
      }
    }, null, 2), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
