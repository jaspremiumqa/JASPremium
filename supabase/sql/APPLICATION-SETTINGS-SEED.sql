-- Seed website-wide application settings.
-- Assumes public.application_settings has:
-- setting_key text unique, setting_value jsonb, active boolean.

insert into public.application_settings (setting_key, setting_value, active)
values
  ('display_currency', '"USD"'::jsonb, true),
  ('currency_options', '{"USD":{"en":"$","ar":"$"},"QAR":{"en":"QAR","ar":"ريال"}}'::jsonb, true),
  ('default_language', '"en"'::jsonb, true),
  ('contact_phone', '"+1 234 567 890"'::jsonb, true)
on conflict (setting_key)
do update set
  setting_value = excluded.setting_value,
  active = excluded.active,
  updated_at = now();

-- Allow the public website to read active settings.
alter table public.application_settings enable row level security;

drop policy if exists "public_read_active_application_settings"
on public.application_settings;

create policy "public_read_active_application_settings"
on public.application_settings
for select
to anon, authenticated
using (active = true);


drop policy if exists "admins_manage_application_settings"
on public.application_settings;

create policy "admins_manage_application_settings"
on public.application_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.role = 'admin'
      and au.active = true
  )
)
with check (
  exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.role = 'admin'
      and au.active = true
  )
);
