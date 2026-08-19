# Project structure

## Website pages
The static HTML pages remain at the project root so existing routes and Cloudflare/static hosting paths do not change.

## Assets
- `assets/css/` — site and CRM styles.
- `assets/js/` — browser JavaScript.
- `assets/js/config/` — shared runtime configuration loaders.
- `assets/js/crm/` — CRM-specific logic.

## Supabase
- `supabase/functions/` — Edge Functions.
- `supabase/sql/` — database setup, seed and RLS scripts.

## Documentation
- `docs/` — setup and testing notes.

### Application Settings
- Public loader: `assets/js/config/application-settings.js`
- CRM UI/logic: `assets/js/crm/admin-crm.js`
- CRM styles: `assets/css/admin-crm.css`
- Seed: `supabase/sql/APPLICATION-SETTINGS-SEED.sql`
- RLS fix: `supabase/sql/application-settings-rls.sql`

## Runtime fallback data
- Application settings are stored in Supabase `application_settings`.
- Service catalogue is stored in Supabase `service_categories` and `services`; application-level currency/language settings are stored in Supabase `application_settings`.
