-- Service category images
-- Run once in Supabase SQL Editor if the site-assets storage setup has not
-- already been run.
--
-- The CRM uploads category images to the existing public `site-assets` bucket
-- under the `categories/` folder and stores the public URL in
-- public.service_categories.image_url. No new database column is required.

begin;

insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update set public = true;

-- Keep the existing site-assets policies used by Settings/branding. These
-- additional policies only grant Service-management users access to the
-- `categories/` folder.
drop policy if exists "crm_permission_upload_category_images" on storage.objects;
drop policy if exists "crm_permission_update_category_images" on storage.objects;
drop policy if exists "crm_permission_delete_category_images" on storage.objects;

create policy "crm_permission_upload_category_images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'site-assets'
  and (name like 'categories/%')
  and public.crm_has_permission('services', 'create')
);

create policy "crm_permission_update_category_images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'site-assets'
  and (name like 'categories/%')
  and public.crm_has_permission('services', 'update')
)
with check (
  bucket_id = 'site-assets'
  and (name like 'categories/%')
  and public.crm_has_permission('services', 'update')
);

create policy "crm_permission_delete_category_images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'site-assets'
  and (name like 'categories/%')
  and public.crm_has_permission('services', 'delete')
);

commit;
