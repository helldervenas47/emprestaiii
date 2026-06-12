-- Restrict user_roles SELECT to the user's own row.
drop policy if exists "Users can view their own roles" on public.user_roles;
drop policy if exists "Users view own role" on public.user_roles;
create policy "Users view own role"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

-- Restrict system_telegram_bots SELECT (token column) to admins only.
drop policy if exists "Users can view active system bots" on public.system_telegram_bots;
drop policy if exists "Admins view system bots" on public.system_telegram_bots;
create policy "Admins view system bots"
  on public.system_telegram_bots for select to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'admin'
    )
  );

-- Token-less view for the app to read bot name/purpose/active.
create or replace view public.system_telegram_bots_public as
  select id, name, purpose, active, bot_id, created_at
  from public.system_telegram_bots
  where active = true;

grant select on public.system_telegram_bots_public to authenticated;
