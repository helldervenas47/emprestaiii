import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // List active cron jobs
  const { data: jobs, error: jobsErr } = await supabase
    .schema("cron" as any)
    .from("job")
    .select("jobid, jobname, schedule, active, command");

  // Last 50 run details
  const { data: runs, error: runsErr } = await supabase
    .schema("cron" as any)
    .from("job_run_details")
    .select("jobid, runid, status, return_message, start_time, end_time")
    .order("start_time", { ascending: false })
    .limit(80);

  // Aggregate per job
  const perJob: Record<string, any> = {};
  for (const r of (runs ?? []) as any[]) {
    const key = String(r.jobid);
    if (!perJob[key]) perJob[key] = { total: 0, succeeded: 0, failed: 0, last_status: null, last_message: null, last_start: null };
    perJob[key].total++;
    if (r.status === "succeeded") perJob[key].succeeded++;
    else perJob[key].failed++;
    if (!perJob[key].last_start) {
      perJob[key].last_status = r.status;
      perJob[key].last_message = r.return_message;
      perJob[key].last_start = r.start_time;
    }
  }

  const summary = (jobs ?? []).map((j: any) => ({
    jobid: j.jobid,
    jobname: j.jobname,
    schedule: j.schedule,
    active: j.active,
    command_preview: String(j.command).slice(0, 160),
    runs: perJob[String(j.jobid)] ?? { total: 0 },
  }));

  return new Response(
    JSON.stringify({ jobs_count: jobs?.length ?? 0, jobsErr, runsErr, summary }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
