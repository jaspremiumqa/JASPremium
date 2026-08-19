# CRM Users setup

1. Run `supabase/sql/CRM-USERS-SETUP.sql` once in Supabase SQL Editor.
2. Find your own user in Supabase Authentication → Users and copy its User UID.
3. Run:
   ```sql
   update public.admin_users
   set role = 'admin', active = true
   where user_id = 'YOUR-AUTH-USER-UUID';
   ```
4. Keep the `invite-crm-user` Edge Function deployed.
5. Do not put a service-role/secret key in GitHub or frontend code.

The browser uses the publishable key. The Edge Function uses Supabase's built-in server-side `SUPABASE_SERVICE_ROLE_KEY`.


### Existing CRM users
The SQL also backfills `email` and `full_name` from Supabase Auth for users that were created before the profile columns were added.
