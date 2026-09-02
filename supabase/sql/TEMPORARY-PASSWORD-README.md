# Temporary CRM passwords

Run `TEMPORARY-PASSWORD-SETUP.sql` once in Supabase SQL Editor.

Deploy these Edge Functions:

- `set-crm-temp-password`
- `complete-crm-password-change`

Both functions require the existing `SUPABASE_SERVICE_ROLE_KEY` secret in the Edge Function environment.

The workflow is:

1. An Administrator opens Users & Access → Edit user.
2. Administrator sets or generates a temporary password.
3. The server updates the Supabase Auth password and marks `admin_users.must_change_password = true`.
4. The next time the user enters the CRM, access is blocked and they must choose a new password.
5. The forced password-change screen calls `complete-crm-password-change`, which updates the Auth password and clears the flag.

Passwords are never stored in `admin_users` or returned by the Edge Functions.
