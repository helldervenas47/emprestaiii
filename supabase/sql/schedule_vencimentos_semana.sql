-- Run this SQL once in the Supabase SQL editor to schedule the weekly
-- "Vencimentos próximos 7 dias" report (sent every Monday 08:00 America/Sao_Paulo = 11:00 UTC).
-- Requires extensions: pg_cron, pg_net (already enabled in this project).

select cron.unschedule('telegram-vencimentos-semana')
where exists (select 1 from cron.job where jobname = 'telegram-vencimentos-semana');

select cron.schedule(
  'telegram-vencimentos-semana',
  '0 11 * * 1', -- Monday 11:00 UTC = 08:00 America/Sao_Paulo
  $$
  select net.http_post(
    url := 'https://lcjelojqxpnphupsnmuq.supabase.co/functions/v1/telegram-vencimentos-semana',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
