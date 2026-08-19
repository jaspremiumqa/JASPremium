# Supabase setup

This GitHub Pages project is now connected to the Supabase project:

`https://nonucaahxdwhmtqaoqii.supabase.co`

The website uses the Supabase browser client from the jsDelivr CDN. The file
`assets/js/supabase-client.js` contains only the **publishable** key.

## Security

RLS is enabled on the database tables. Never put a `service_role` or
`sb_secret_*` key into this repository.

## Current state

The website can connect to Supabase and query the tables. The database is
currently empty, so the existing local JSON files remain the display fallback.

## Next steps

1. Confirm the connection in the browser console.
2. Import the real salon services/categories into Supabase (using real QAR
   prices and durations supplied by the salon).
3. Import working hours.
4. Replace the temporary browser-only booking flow with a secure database
   booking function.
5. Build the protected admin/CRM area.
