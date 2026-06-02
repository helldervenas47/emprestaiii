
-- RESTORATION MIGRATION
BEGIN;

-- 1. RE-CREATE DROPPED TABLES (from original schema)
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cpf TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  rg TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  score TEXT NOT NULL DEFAULT '',
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  borrower_name TEXT NOT NULL,
  borrower_id TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  interest_rate NUMERIC NOT NULL DEFAULT 0,
  interest_type TEXT NOT NULL DEFAULT 'Mensal',
  payment_type TEXT NOT NULL DEFAULT 'Parcelado',
  start_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  paid_installments INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loans TO authenticated;
GRANT ALL ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  loan_id UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  installment_number INTEGER NOT NULL DEFAULT 0,
  previous_due_date TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'fixa',
  category TEXT NOT NULL DEFAULT '',
  installments INTEGER,
  paid_installments INTEGER DEFAULT 0,
  due_date TEXT NOT NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_date TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.balance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  amount NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balance TO authenticated;
GRANT ALL ON public.balance TO service_role;
ALTER TABLE public.balance ENABLE ROW LEVEL SECURITY;

-- 2. RE-CREATE TELEGRAM TABLES (Corrected)
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

-- 3. POLICIES
CREATE POLICY "Users view own clients" ON public.clients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own clients" ON public.clients FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own clients" ON public.clients FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users view own loans" ON public.loans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own loans" ON public.loans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own loans" ON public.loans FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own loans" ON public.loans FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users view own payments" ON public.payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own payments" ON public.payments FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users view own expenses" ON public.expenses FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own expenses" ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own expenses" ON public.expenses FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users view own balance" ON public.balance FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own balance" ON public.balance FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own balance" ON public.balance FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "user_telegram_bots_select_own" ON public.user_telegram_bots FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_insert_own" ON public.user_telegram_bots FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_update_own" ON public.user_telegram_bots FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_delete_own" ON public.user_telegram_bots FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Service role manages system bots" ON public.system_telegram_bots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users view active system bots" ON public.system_telegram_bots FOR SELECT TO authenticated USING (active = true);

CREATE POLICY "Users manage own links" ON public.telegram_links FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages links" ON public.telegram_links FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users manage own codes" ON public.telegram_link_codes FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages codes" ON public.telegram_link_codes FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages messages" ON public.telegram_messages FOR ALL USING (auth.role() = 'service_role');

COMMIT;
