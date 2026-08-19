# delete-crm-user

Deploy this Edge Function from the project root:

```bash
supabase functions deploy delete-crm-user
```

The function uses the Supabase project-provided `SUPABASE_SERVICE_ROLE_KEY`.
Do not put the service-role key in frontend JavaScript.

Before using the Delete button:

1. Run `supabase/sql/CRM-DELETE-USER.sql` in the Supabase SQL Editor.
2. Deploy this function.
3. Ensure the role has the `users.delete` permission.
4. Refresh the CRM.

The browser calls the function with the logged-in user's session. The function
checks `crm_has_permission('users', 'delete')`, prevents self-deletion, deletes
the target from `auth.users`, and defensively removes the matching
`public.admin_users` row.
