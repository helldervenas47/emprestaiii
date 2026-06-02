
-- Migration: Recreate Telegram Tables for Token Connection
BEGIN;

-- 1. Drop existing tables if they exist
DROP TABLE IF EXISTS public.telegram_link_codes CASCADE;
DROP TABLE IF EXISTS public.telegram_links CASCADE;
DROP TABLE IF EXISTS public.telegram_messages CASCADE;
DROP TABLE IF EXISTS public.telegram_bot_state CASCADE;
DROP TABLE IF EXISTS public.telegram_bots CASCADE;
DROP TABLE IF EXISTS public.system_telegram_bots CASCADE;
DROP TABLE IF EXISTS public.user_telegram_bots CASCADE;

-- 2. Create User Bots Table (Specific for each user if needed)
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

CREATE INDEX idx_user_telegram_bots_owner ON public.user_telegram_bots(owner_id);
ALTER TABLE public.user_telegram_bots ENABLE ROW LEVEL SECURITY;

-- 3. Create System Bots Table (Global shared bots)
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

-- 4. Create Telegram Links (Mapping user <-> chat_id)
CREATE TABLE public.telegram_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  chat_id bigint not null,
  bot_id uuid REFERENCES public.system_telegram_bots(id) ON DELETE CASCADE,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_links TO authenticated;
GRANT ALL ON public.telegram_links TO service_role;

CREATE INDEX idx_telegram_links_user_id ON public.telegram_links(user_id);
CREATE INDEX idx_telegram_links_chat_id ON public.telegram_links(chat_id);
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

-- 5. Create Telegram Link Codes (Temporary codes for pairing)
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

-- 6. Telegram Messages (Incoming queue)
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

CREATE INDEX idx_telegram_messages_unprocessed ON public.telegram_messages (created_at) WHERE processed = false;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;

-- 7. Policies for User Bots
CREATE POLICY "user_telegram_bots_select_own" ON public.user_telegram_bots FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_insert_own" ON public.user_telegram_bots FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_update_own" ON public.user_telegram_bots FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "user_telegram_bots_delete_own" ON public.user_telegram_bots FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- 8. Policies for System Bots
CREATE POLICY "Service role manages system bots" ON public.system_telegram_bots FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can view active system bots" ON public.system_telegram_bots FOR SELECT TO authenticated USING (active = true);

-- 9. Policies for Links and Codes
CREATE POLICY "Users manage own links" ON public.telegram_links FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages links" ON public.telegram_links FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users manage own codes" ON public.telegram_link_codes FOR ALL TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role manages codes" ON public.telegram_link_codes FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role manages messages" ON public.telegram_messages FOR ALL USING (auth.role() = 'service_role');

-- 10. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_user_telegram_bots_updated_at BEFORE UPDATE ON public.user_telegram_bots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_system_telegram_bots_updated_at BEFORE UPDATE ON public.system_telegram_bots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;