-- Website image management for CRM.
-- Run after APPLICATION-BRANDING-IMAGES-SETUP.sql.

begin;

insert into public.application_settings (setting_key, setting_value, description, active)
values
  ('who_we_are_image_1', '{"path":"","url":"","width":"100%","height":"auto"}'::jsonb, 'Who We Are image 1 used by the public website.', true),
  ('who_we_are_image_2', '{"path":"","url":"","width":"100%","height":"auto"}'::jsonb, 'Who We Are image 2 used by the public website.', true),
  ('who_we_are_image_3', '{"path":"","url":"","width":"100%","height":"auto"}'::jsonb, 'Who We Are image 3 used by the public website.', true),
  ('homepage_hero_image', '{"path":"","url":"","width":"100%","height":"auto"}'::jsonb, 'Homepage hero image used by the public website.', true),
  ('services_section_image', '{"path":"","url":"","width":"100%","height":"auto"}'::jsonb, 'Services section image used by the public website.', true),
  ('contact_section_image', '{"path":"","url":"","width":"100%","height":"auto"}'::jsonb, 'Contact section image used by the public website.', true)
on conflict (setting_key) do nothing;

-- These images are upload-only now. Clear any old local-asset defaults from a previous version.
update public.application_settings
set setting_value = jsonb_build_object('path','', 'url','', 'width','100%', 'height','auto'),
    updated_at = now()
where setting_key in ('who_we_are_image_1','who_we_are_image_2','who_we_are_image_3','homepage_hero_image','services_section_image','contact_section_image')
  and (setting_value->>'url') in (
    'assets/images/about-1-300x460.jpg',
    'assets/images/about-2-300x460.jpg',
    'assets/images/about-3-300x460.jpg',
    'assets/images/home-three-1-1920x800.jpg'
  );

commit;

-- Existing site-assets policies allow active CRM admins to upload/delete files.
-- New uploads are stored under website/.
