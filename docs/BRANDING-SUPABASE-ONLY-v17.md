# Branding v17 — Supabase only

The public website does not use local logo/banner fallback files.

## Runtime source

`assets/js/config/application-settings.js` reads active `public.application_settings` rows:
- `header_image`
- `banner_image`

Each value must contain `url`, `width`, and `height`.

If Supabase cannot be read or a branding setting is missing/invalid, the site does not substitute a local image. The branding remains empty and the error is logged.

## Storage

Uploaded images are stored in the public Supabase Storage bucket `site-assets`. The CRM saves the resulting public Storage URL into `application_settings`.

## Restore/Delete

The CRM keeps `header_image_default` and `banner_image_default` as inactive Supabase settings. Clicking Delete removes an uploaded Storage object and writes the Supabase-stored default back into the active setting.

Run `supabase/sql/APPLICATION-BRANDING-IMAGES-SETUP.sql` once to create/update the default settings.
