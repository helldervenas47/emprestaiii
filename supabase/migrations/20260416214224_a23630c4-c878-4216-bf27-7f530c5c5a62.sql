SELECT cron.schedule(
  'telegram-monthly-summary',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://syyxnqzxqabeuqbuptkh.supabase.co/functions/v1/telegram-monthly-summary',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
