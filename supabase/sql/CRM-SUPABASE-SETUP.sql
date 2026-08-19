
-- ============================================================
-- Salon CRM security setup
-- Zero-cost: Supabase Auth + RLS
-- ============================================================

-- 1) Admin allow-list
create table if not exists public.admin_users (
    user_id uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Only the database security-definer function needs to read this table.
drop policy if exists "admin_users_no_direct_select" on public.admin_users;

-- 2) Helper: returns true only for users explicitly added to admin_users.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1
        from public.admin_users
        where user_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 3) Service categories
drop policy if exists "crm_admin_insert_categories" on public.service_categories;
drop policy if exists "crm_admin_update_categories" on public.service_categories;
drop policy if exists "crm_admin_delete_categories" on public.service_categories;
drop policy if exists "crm_admin_select_categories" on public.service_categories;

create policy "crm_admin_select_categories"
on public.service_categories
for select
to authenticated
using (public.is_admin());

create policy "crm_admin_insert_categories"
on public.service_categories
for insert
to authenticated
with check (public.is_admin());

create policy "crm_admin_update_categories"
on public.service_categories
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "crm_admin_delete_categories"
on public.service_categories
for delete
to authenticated
using (public.is_admin());

-- 4) Services
drop policy if exists "crm_admin_insert_services" on public.services;
drop policy if exists "crm_admin_update_services" on public.services;
drop policy if exists "crm_admin_delete_services" on public.services;
drop policy if exists "crm_admin_select_services" on public.services;

create policy "crm_admin_select_services"
on public.services
for select
to authenticated
using (public.is_admin());

create policy "crm_admin_insert_services"
on public.services
for insert
to authenticated
with check (public.is_admin());

create policy "crm_admin_update_services"
on public.services
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "crm_admin_delete_services"
on public.services
for delete
to authenticated
using (public.is_admin());

-- 5) Verify RLS is enabled
alter table public.service_categories enable row level security;
alter table public.services enable row level security;

-- NOTE:
-- Public/anon SELECT policies for the website should remain in place.
-- These CRM policies add authenticated-admin access; they do not expose
-- INSERT/UPDATE/DELETE to anonymous visitors.
