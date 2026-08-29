-- Complete the role permission catalogue for every CRM section currently
-- present in admin.html. Run once after ROLE-BASED-PERMISSIONS-SETUP.sql.

begin;

insert into public.crm_permissions (section, action, description)
values
  ('faqs', 'read', 'View FAQs'),
  ('faqs', 'create', 'Create FAQs'),
  ('faqs', 'update', 'Update FAQs'),
  ('faqs', 'delete', 'Delete FAQs'),
  ('booking-config', 'read', 'View booking setup'),
  ('booking-config', 'create', 'Create booking rules'),
  ('booking-config', 'update', 'Update booking setup'),
  ('booking-config', 'delete', 'Delete booking rules'),
  ('contact-messages', 'read', 'View Contact Us requests'),
  ('contact-messages', 'create', 'Create Contact Us requests'),
  ('contact-messages', 'update', 'Update Contact Us requests'),
  ('contact-messages', 'delete', 'Delete Contact Us requests'),
  ('chart-of-accounts', 'read', 'View Chart of Accounts'),
  ('chart-of-accounts', 'create', 'Create Chart of Accounts entries'),
  ('chart-of-accounts', 'update', 'Update Chart of Accounts entries'),
  ('chart-of-accounts', 'delete', 'Delete Chart of Accounts entries'),
  ('settings', 'read', 'View application settings'),
  ('settings', 'create', 'Create application settings'),
  ('settings', 'update', 'Update application settings'),
  ('settings', 'delete', 'Delete application settings')
on conflict (section, action) do nothing;

-- Administrator must have every permission, including newly added sections.
insert into public.crm_role_permissions (role_id, permission_id)
select r.id, p.id
from public.crm_roles r
cross join public.crm_permissions p
where lower(r.name) = 'admin'
on conflict do nothing;

commit;
