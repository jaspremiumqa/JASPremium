-- Application branding images: header logo + page-title banner.
-- Run once in Supabase SQL Editor.
-- Requires the existing public.admin_users table and active admin account.

begin;

-- Public bucket so the website can render uploaded branding without a login.
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update set public = true;

-- Keep existing policies if they were created previously, then replace them
-- with policies restricted to active CRM administrators.
drop policy if exists "crm_admin_upload_site_assets" on storage.objects;
drop policy if exists "crm_admin_update_site_assets" on storage.objects;
drop policy if exists "crm_admin_delete_site_assets" on storage.objects;

create policy "crm_admin_upload_site_assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'site-assets'
  and exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.active = true
      and au.role = 'admin'
  )
);

create policy "crm_admin_update_site_assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'site-assets'
  and exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.active = true
      and au.role = 'admin'
  )
)
with check (
  bucket_id = 'site-assets'
  and exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.active = true
      and au.role = 'admin'
  )
);

create policy "crm_admin_delete_site_assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'site-assets'
  and exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.active = true
      and au.role = 'admin'
  )
);

-- Add the two settings used by the CRM branding editor.
insert into public.application_settings (setting_key, setting_value, description, active)
values
  (
    'header_image',
    '{"path":"assets/images/logo.jpeg","url":"assets/images/logo.jpeg","width":"125px","height":"100px"}'::jsonb,
    'Website header image and display dimensions.',
    true
  ),
  (
    'banner_image',
    '{"path":"assets/images/main-banner.JPG","url":"assets/images/main-banner.JPG","width":"100%","height":"20.83333333333333vw"}'::jsonb,
    'Website page banner image and display dimensions.',
    true
  )
on conflict (setting_key) do nothing;

-- Store the original website images in Supabase as inactive defaults. These are
-- used only when an administrator explicitly clicks Delete/Restore in the CRM.
-- The public website never falls back to these local files.
insert into public.application_settings (setting_key, setting_value, description, active)
values
  (
    'header_image_default',
    '{"path":"assets/images/logo.jpeg","url":"assets/images/logo.jpeg","width":"125px","height":"100px"}'::jsonb,
    'Supabase-stored default header image used by the CRM restore action.',
    false
  ),
  (
    'banner_image_default',
    '{"path":"assets/images/main-banner.JPG","url":"assets/images/main-banner.JPG","width":"100%","height":"20.83333333333333vw"}'::jsonb,
    'Supabase-stored default banner image used by the CRM restore action.',
    false
  )
on conflict (setting_key) do update set
  setting_value = excluded.setting_value,
  description = excluded.description,
  active = false;


commit;

-- IMPORTANT:
-- The public website reads active application settings.
-- The existing application_settings RLS from application-settings-rls.sql
-- remains responsible for public SELECT and CRM admin management.
