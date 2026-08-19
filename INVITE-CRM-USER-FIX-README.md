# CRM User Invitation Fix

This build synchronizes the `invite-crm-user` Edge Function with the role-permission system.

## Deploy

Deploy the included function:

supabase functions deploy invite-crm-user

Do NOT replace it with an older version. The function checks:
- `users.create` to invite/create CRM users
- `roles.update` to assign the selected CRM role

It uses the authenticated user's JWT for these checks and the service role only for the privileged Auth/admin operations.

## Database

Run:
`supabase/sql/INVITE-CRM-USER-ROLE-PERMISSION-FIX.sql`

This ensures the Administrator role has `users.create` and `roles.update`.

## Important

If the browser still returns the exact message `Administrator access required.`, that message is coming from an older deployed Edge Function, not this source. Redeploy the included function.
