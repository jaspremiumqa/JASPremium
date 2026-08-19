-- INVITE CRM USER ROLE-PERMISSION FIX
-- The deployed Edge Function must use users.create + roles.update permissions.
-- No RLS weakening is required.

-- Ensure the admin role has permission to create users and assign roles.
insert into public.crm_permissions (section, action)
select v.section, v.action
from (values
  ('users','create'),
  ('roles','update')
) as v(section, action)
where not exists (
  select 1 from public.crm_permissions p
  where p.section = v.section and p.action = v.action
);

insert into public.crm_role_permissions (role_id, permission_id)
select r.id, p.id
from public.crm_roles r
join public.crm_permissions p
  on (p.section, p.action) in (('users','create'), ('roles','update'))
where lower(r.name) in ('admin','administrator')
on conflict do nothing;

-- Verify:
select r.id, r.name, p.section, p.action
from public.crm_roles r
join public.crm_role_permissions rp on rp.role_id = r.id
join public.crm_permissions p on p.id = rp.permission_id
where lower(r.name) in ('admin','administrator')
  and p.section in ('users','roles')
  and p.action in ('create','update')
order by r.id, p.section, p.action;
