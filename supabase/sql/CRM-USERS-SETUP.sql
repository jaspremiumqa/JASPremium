-- CRM Users & Access security
-- Run this once in Supabase SQL Editor.

alter table public.admin_users
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text not null default 'staff',
  add column if not exists active boolean not null default true;

alter table public.admin_users
  drop constraint if exists admin_users_role_check;

alter table public.admin_users
  add constraint admin_users_role_check
  check (role in ('admin','manager','staff'));

-- Backfill email and display name for CRM users that already existed
-- before these profile columns were added.
update public.admin_users au
set
  email = u.email,
  full_name = coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    split_part(coalesce(u.email, ''), '@', 1)
  )
from auth.users u
where au.user_id = u.id
  and (au.email is null or au.full_name is null);

create unique index if not exists admin_users_email_unique
  on public.admin_users (lower(email))
  where email is not null;

alter table public.admin_users enable row level security;

-- Any active CRM user can pass the CRM gate.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and active = true
  );
$$;

-- Only an Administrator can manage other CRM users.
create or replace function public.is_crm_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
      and active = true
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

revoke all on function public.is_crm_admin() from public;
grant execute on function public.is_crm_admin() to authenticated;

drop policy if exists "crm_admin_select_users" on public.admin_users;
drop policy if exists "crm_admin_update_users" on public.admin_users;
drop policy if exists "crm_admin_insert_users" on public.admin_users;
drop policy if exists "crm_user_select_self" on public.admin_users;

-- A CRM user may read only their own profile.
create policy "crm_user_select_self"
on public.admin_users for select to authenticated
using (user_id = auth.uid() and active = true);

-- Administrators may manage the complete CRM user list.
create policy "crm_admin_select_users"
on public.admin_users for select to authenticated
using (public.is_crm_admin());

create policy "crm_admin_update_users"
on public.admin_users for update to authenticated
using (public.is_crm_admin())
with check (public.is_crm_admin());

create policy "crm_admin_insert_users"
on public.admin_users for insert to authenticated
with check (public.is_crm_admin());

-- IMPORTANT:
-- After running this SQL, make your own existing CRM account an Administrator.
-- Replace the UUID with your Supabase Authentication user ID.
--
-- update public.admin_users
-- set role = 'admin', active = true
-- where user_id = 'YOUR-AUTH-USER-UUID';
