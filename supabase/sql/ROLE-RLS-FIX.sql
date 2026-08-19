-- ============================================================
-- CRM ROLE DATA RLS FIX
--
-- Fixes empty Roles & Permissions data caused by missing/overly
-- restrictive RLS policies on the role catalogue tables.
--
-- Authorization is enforced through crm_has_permission(), while
-- crm_get_my_access() remains the source for the current user's
-- role/permission payload.
-- ============================================================

begin;

alter table public.crm_roles enable row level security;
alter table public.crm_permissions enable row level security;
alter table public.crm_role_permissions enable row level security;

-- Remove previous versions if they exist.
drop policy if exists crm_roles_read on public.crm_roles;
drop policy if exists crm_roles_create on public.crm_roles;
drop policy if exists crm_roles_update on public.crm_roles;
drop policy if exists crm_roles_delete on public.crm_roles;

drop policy if exists crm_permissions_read on public.crm_permissions;

drop policy if exists crm_role_permissions_read on public.crm_role_permissions;
drop policy if exists crm_role_permissions_create on public.crm_role_permissions;
drop policy if exists crm_role_permissions_update on public.crm_role_permissions;
drop policy if exists crm_role_permissions_delete on public.crm_role_permissions;

-- Role catalogue ------------------------------------------------
create policy crm_roles_read
on public.crm_roles
for select
to authenticated
using (public.crm_has_permission('roles', 'read'));

create policy crm_roles_create
on public.crm_roles
for insert
to authenticated
with check (public.crm_has_permission('roles', 'create'));

create policy crm_roles_update
on public.crm_roles
for update
to authenticated
using (public.crm_has_permission('roles', 'update'))
with check (public.crm_has_permission('roles', 'update'));

create policy crm_roles_delete
on public.crm_roles
for delete
to authenticated
using (public.crm_has_permission('roles', 'delete'));

-- Permission catalogue is read-only from the CRM. ----------------
create policy crm_permissions_read
on public.crm_permissions
for select
to authenticated
using (public.crm_has_permission('roles', 'read'));

-- Role/permission assignments ----------------------------------
create policy crm_role_permissions_read
on public.crm_role_permissions
for select
to authenticated
using (public.crm_has_permission('roles', 'read'));

create policy crm_role_permissions_create
on public.crm_role_permissions
for insert
to authenticated
with check (public.crm_has_permission('roles', 'create') or public.crm_has_permission('roles', 'update'));

create policy crm_role_permissions_update
on public.crm_role_permissions
for update
to authenticated
using (public.crm_has_permission('roles', 'update'))
with check (public.crm_has_permission('roles', 'update'));

create policy crm_role_permissions_delete
on public.crm_role_permissions
for delete
to authenticated
using (public.crm_has_permission('roles', 'update') or public.crm_has_permission('roles', 'delete'));

commit;

-- Verify from the Supabase SQL editor (table access itself):
-- select id, name, description, is_system from public.crm_roles order by id;
-- select id, section, action from public.crm_permissions order by section, action;
