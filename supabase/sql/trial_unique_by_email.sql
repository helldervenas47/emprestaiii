-- Unicidade do plano de teste por email — aplicar no Supabase EXTERNO.
--
-- Objetivos:
--   1. Marcar quando um email já consumiu o trial (profiles.trial_used_at).
--   2. Backfill: quem já tem trial_started_at é considerado como já usado.
--   3. Trigger: ao gravar trial_started_at, copia para trial_used_at.
--   4. Função pública `has_used_trial(email)` (SECURITY DEFINER) consultável
--      via RPC pelo frontend ANTES do signup.
-- Idempotente.

alter table public.profiles
  add column if not exists trial_used_at timestamptz;

-- Backfill: quem já iniciou trial conta como já usado.
update public.profiles
   set trial_used_at = trial_started_at
 where trial_used_at is null
   and trial_started_at is not null;

create index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

-- Trigger: garantir que trial_used_at seja preenchido quando trial_started_at for setado.
create or replace function public.set_trial_used_at()
returns trigger
language plpgsql
as $$
begin
  if new.trial_started_at is not null and new.trial_used_at is null then
    new.trial_used_at := new.trial_started_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_trial_used_at on public.profiles;
create trigger trg_set_trial_used_at
  before insert or update of trial_started_at on public.profiles
  for each row execute function public.set_trial_used_at();

-- Função consultável pelo frontend (anon + authenticated) ANTES do signup.
-- SECURITY DEFINER para não expor SELECT em profiles.
create or replace function public.has_used_trial(_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where lower(email) = lower(_email)
       and trial_used_at is not null
  );
$$;

grant execute on function public.has_used_trial(text) to anon, authenticated, service_role;
