-- Application Settings: WhatsApp, Facebook and Instagram
-- Run once in Supabase SQL Editor.
-- The CRM controls only the public URL and active/hidden state.
-- The website already contains the three Font Awesome icons in its HTML.

begin;

insert into public.application_settings (setting_key, setting_value, description, active)
values
  ('social_whatsapp', '{"url":""}'::jsonb, 'WhatsApp social link.', false),
  ('social_facebook', '{"url":""}'::jsonb, 'Facebook social link.', false),
  ('social_instagram', '{"url":""}'::jsonb, 'Instagram social link.', false)
on conflict (setting_key) do nothing;

-- Remove legacy social settings from the previous 7-channel implementation.
delete from public.application_settings
where setting_key in ('social_tiktok','social_youtube','social_snapchat','social_x');

-- Remove legacy social icon uploads. The website already supplies the icons in HTML.
delete from storage.objects
where bucket_id = 'site-assets'
  and name like 'social-icons/%';

commit;
