-- Add website_name to public application_settings.
begin;

insert into public.application_settings (setting_key, setting_value, description, active)
values ('website_name', 'Glow & Glam by Sara'::jsonb, 'Public website name used across the website and browser title.', true)
on conflict (setting_key) do nothing;

commit;
