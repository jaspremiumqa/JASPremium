-- Supabase-backed favicon for the public website.
begin;

insert into public.application_settings (setting_key, setting_value, description, active)
values (
  'favicon_image',
  '{"path":"","url":"","width":"32px","height":"32px"}'::jsonb,
  'Website favicon shown in the browser tab. Empty until an administrator uploads one.',
  true
)
on conflict (setting_key) do nothing;

commit;

-- The public website reads this setting directly from Supabase.
-- No local favicon fallback is used.
