-- CRM user deletion support.
-- Run this once in the Supabase SQL Editor.
--
-- The CRM profile references auth.users with ON DELETE CASCADE, so
-- deleting an Auth user also deletes public.admin_users automatically.
--
-- The Edge Function delete-crm-user performs the Auth deletion using
-- SUPABASE_SERVICE_ROLE_KEY and then performs a defensive CRM cleanup.

do $$
declare
  fk_name text;
  has_cascade boolean;
begin
  select c.conname,
         (c.confdeltype = 'c')
    into fk_name, has_cascade
  from pg_constraint c
  join pg_class child on child.oid = c.conrelid
  join pg_class parent on parent.oid = c.confrelid
  join pg_namespace child_ns on child_ns.oid = child.relnamespace
  join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
  where child_ns.nspname = 'public'
    and child.relname = 'admin_users'
    and parent_ns.nspname = 'auth'
    and parent.relname = 'users'
    and c.contype = 'f'
  limit 1;

  if fk_name is null then
    alter table public.admin_users
      add constraint admin_users_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  elsif not has_cascade then
    execute format(
      'alter table public.admin_users drop constraint %I',
      fk_name
    );

    alter table public.admin_users
      add constraint admin_users_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;
end $$;

-- Ensure the delete permission exists for the CRM role/permission system.
insert into public.crm_permissions (section, action, description)
select 'users', 'delete', 'Delete CRM users from Supabase Auth and CRM'
where not exists (
  select 1
  from public.crm_permissions
  where section = 'users'
    and action = 'delete'
);

-- Verify the FK after migration:
-- select
--   c.conname,
--   c.confdeltype
-- from pg_constraint c
-- join pg_class child on child.oid = c.conrelid
-- join pg_class parent on parent.oid = c.confrelid
-- join pg_namespace child_ns on child_ns.oid = child.relnamespace
-- join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
-- where child_ns.nspname = 'public'
--   and child.relname = 'admin_users'
--   and parent_ns.nspname = 'auth'
--   and parent.relname = 'users'
--   and c.contype = 'f';
