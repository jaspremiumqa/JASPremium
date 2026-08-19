# Application Settings

The website now reads the display currency and default language from `public.application_settings`.

Run `supabase/sql/APPLICATION-SETTINGS-SEED.sql` once in Supabase.

Expected settings:
- `display_currency` = `"USD"`
- `currency_options` = `{"USD":{"en":"$","ar":"$"},"QAR":{"en":"QAR","ar":"ريال"}}`
- `default_language` = `"en"`

The user's selected language remains in browser `localStorage` (`siteLang`). The database `default_language` is used only when the visitor has no saved language preference.


## CRM access / RLS

The CRM saves settings through the authenticated Supabase client, so `application_settings`
must allow authenticated administrators to insert/update settings. Run
`supabase/sql/application-settings-rls.sql` if the CRM shows:

`new row violates row-level security policy for table "application_settings"`.

The public website still has read-only access to active settings.

## Project structure

- `assets/js/config/application-settings.js` — public website application-settings loader.
- `assets/js/crm/admin-crm.js` — CRM application logic.
- `assets/css/admin-crm.css` — CRM styles, including Application Settings.
- `supabase/sql/` — SQL setup, seed and RLS scripts.
- `docs/` — project/setup notes.


## Local fallback

The public website also includes:

- `assets/js/config/application-settings.js` — loads active settings from Supabase. If Supabase is unavailable, it uses small built-in defaults.

Services, prices and durations are read from the Supabase `service_categories` and `services` tables. A missing/invalid service duration defaults to 30 minutes.


## Social & messaging links

Application Settings now includes WhatsApp, Facebook, Instagram, TikTok, YouTube, Snapchat and X. Each channel has:

- Active / not active visibility control
- Public URL
- Supabase-hosted icon
- CRM icon replacement upload

Run `supabase/sql/APPLICATION-SOCIAL-SETTINGS.sql` once. When an administrator opens Application Settings, the bundled default SVG icons are uploaded to the `site-assets` Supabase bucket automatically if an icon is missing.

Only active channels with both a URL and icon are rendered on the public website navigation/footer.
