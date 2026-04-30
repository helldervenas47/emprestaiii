ALTER TABLE public.telegram_summary_prefs
  ADD COLUMN IF NOT EXISTS daily_format text NOT NULL DEFAULT 'text' CHECK (daily_format IN ('text','image')),
  ADD COLUMN IF NOT EXISTS weekly_format text NOT NULL DEFAULT 'text' CHECK (weekly_format IN ('text','image'));

ALTER TABLE public.telegram_billing_prefs
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'text' CHECK (format IN ('text','image'));

ALTER TABLE public.telegram_accumulated_delinquency_prefs
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'text' CHECK (format IN ('text','image'));

ALTER TABLE public.daily_planning_telegram_prefs
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'text' CHECK (format IN ('text','image'));

ALTER TABLE public.personal_insights_telegram_prefs
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'text' CHECK (format IN ('text','image'));

ALTER TABLE public.telegram_manager_weekly_prefs
  ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'text' CHECK (format IN ('text','image'));