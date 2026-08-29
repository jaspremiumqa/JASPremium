-- Add Chart of Accounts permissions and grant them to administrators.
begin;
insert into public.crm_permissions (section, action, description) values
  ('chart-of-accounts','read','View Chart of Accounts'),
  ('chart-of-accounts','create','Create Chart of Accounts entries'),
  ('chart-of-accounts','update','Update Chart of Accounts entries'),
  ('chart-of-accounts','delete','Delete Chart of Accounts entries')
on conflict (section, action) do nothing;
insert into public.crm_role_permissions (role_id, permission_id)
select r.id, p.id from public.crm_roles r cross join public.crm_permissions p
where lower(r.name) in ('admin','administrator') and p.section='chart-of-accounts'
on conflict do nothing;
commit;
