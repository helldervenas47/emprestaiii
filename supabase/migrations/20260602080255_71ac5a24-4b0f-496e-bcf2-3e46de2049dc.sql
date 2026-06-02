
-- FINAL RESTORATION MIGRATION
BEGIN;

-- 1. DROPPED CORE TABLES RESTORATION
CREATE TABLE IF NOT EXISTS public.account_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  occurred_on TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  loan_id UUID,
  expense_id UUID,
  payment_id UUID,
  source TEXT NOT NULL DEFAULT 'manual',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_ledger TO authenticated;
GRANT ALL ON public.account_ledger TO service_role;
ALTER TABLE public.account_ledger ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_goal_prefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  selected TEXT[],
  order_list JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_goal_prefs TO authenticated;
GRANT ALL ON public.user_goal_prefs TO service_role;
ALTER TABLE public.user_goal_prefs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.account_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  auto_backup_enabled BOOLEAN DEFAULT false,
  last_auto_backup_at TIMESTAMPTZ,
  last_auto_backup_drive_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_settings TO authenticated;
GRANT ALL ON public.account_settings TO service_role;
ALTER TABLE public.account_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.backup_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  drive_url TEXT,
  drive_file_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_history TO authenticated;
GRANT ALL ON public.backup_history TO service_role;
ALTER TABLE public.backup_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  highlight BOOLEAN DEFAULT false,
  features TEXT[],
  max_loans INTEGER,
  max_users INTEGER,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  allowed_tabs TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id TEXT,
  price_id TEXT,
  status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  paddle_customer_id TEXT,
  environment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. POLICIES FOR RESTORED TABLES
CREATE POLICY "Profiles are viewable by own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view own account_settings" ON public.account_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own account_settings" ON public.account_settings FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users view own backup_history" ON public.backup_history FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users view own goal_prefs" ON public.user_goal_prefs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own goal_prefs" ON public.user_goal_prefs FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view plans" ON public.plans FOR SELECT USING (active = true);

CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. TELEGRAM TABLES RE-RECREATION (ENSURING FULL CLEANUP)
DROP TABLE IF EXISTS public.telegram_link_codes CASCADE;
DROP TABLE IF EXISTS public.telegram_links CASCADE;
DROP TABLE IF EXISTS public.telegram_messages CASCADE;
DROP TABLE IF EXISTS public.system_telegram_bots CASCADE;
DROP TABLE IF EXISTS public.user_telegram_bots CASCADE;

CREATE TABLE public.system_telegram_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  purpose TEXT NOT NULL DEFAULT 'general' CHECK (purpose IN ('reports','expenses','general')),
  bot_id BIGINT,
  bot_username TEXT,
  validation_status TEXT,
  last_validated_at TIMESTAMPTZ,
  update_offset BIGINT NOT NULL DEFAULT 0,
  last_polled_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_telegram_bots TO authenticated;
GRANT ALL ON public.system_telegram_bots TO service_role;
ALTER TABLE public.system_telegram_bots ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_telegram_bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  bot_username TEXT,
  bot_id BIGINT,
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_telegram_bots TO authenticated;
GRANT ALL ON public.user_telegram_bots TO service_role;
ALTER TABLE public.user_telegram_bots ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chat_id bigint not null,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE CASCADE,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_link_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE CASCADE,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_link_codes TO authenticated;
GRANT ALL ON public.telegram_link_codes TO service_role;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.telegram_messages (
  update_id bigint primary key,
  chat_id bigint not null,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE CASCADE,
  text text,
  raw_update jsonb not null,
  processed boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- 4. FINAL POLICIES
CREATE POLICY "Service role manages system bots" ON public.system_telegram_bots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can view active system bots" ON public.system_telegram_bots FOR SELECT TO authenticated USING (active = true);

CREATE POLICY "user_telegram_bots_select_own" ON public.user_telegram_bots FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_insert_own" ON public.user_telegram_bots FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_update_own" ON public.user_telegram_bots FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_delete_own" ON public.user_telegram_bots FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Users manage own links" ON public.telegram_links FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages links" ON public.telegram_links FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users manage own codes" ON public.telegram_link_codes FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages codes" ON public.telegram_link_codes FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages messages" ON public.telegram_messages FOR ALL USING (auth.role() = 'service_role');

COMMIT;
