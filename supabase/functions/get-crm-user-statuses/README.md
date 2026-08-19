# CRM user authentication status

Deploy with:

```bash
supabase functions deploy get-crm-user-statuses
```

Returns Supabase Auth status for CRM users, including:
- `email_confirmed_at` — whether the invitation email/account is verified.
- `last_sign_in_at` — whether the user has ever logged in and their last login time.
- `invited_at` — when Supabase sent the invitation.
