-- Temporary-password workflow for CRM users.
-- Run once in Supabase SQL Editor.

begin;

alter table public.admin_users
  add column if not exists must_change_password boolean not null default false;

create or replace function public.crm_get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'role', r.name,
    'email', au.email,
    'role_id', au.role_id,
    'user_id', au.user_id,
    'must_change_password', au.must_change_password,
    'permissions', coalesce((
      select jsonb_agg(jsonb_build_object('section', p.section, 'action', p.action) order by p.section, p.action)
      from public.crm_role_permissions rp
      join public.crm_permissions p on p.id = rp.permission_id
      where rp.role_id = au.role_id
    ), '[]'::jsonb)
  )
  from public.admin_users au
  left join public.crm_roles r on r.id = au.role_id
  where au.user_id = auth.uid()
    and au.active = true;
$$;

grant execute on function public.crm_get_my_access() to authenticated;

commit;
