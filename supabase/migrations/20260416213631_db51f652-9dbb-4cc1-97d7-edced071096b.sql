SELECT cron.schedule(
  'telegram-weekly-summary',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-weekly-summary',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
