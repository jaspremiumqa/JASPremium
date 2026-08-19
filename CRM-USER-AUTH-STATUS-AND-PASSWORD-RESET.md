# CRM user verification / login status and password reset

This update adds two CRM user-management capabilities:

1. Authentication status
   - `Verified` means Supabase `email_confirmed_at` is populated.
   - `Never logged in` means `last_sign_in_at` is empty.
   - Otherwise the table shows the user's last login date/time.

2. Password reset
   - A `Reset password` button appears for other CRM users when the current user has `users.update` permission.
   - The reset is sent by Supabase Auth email; the CRM never receives or stores the user's new password.
   - The reset link opens `admin.html?recovery=1` and lets the user choose a new password.

Deploy the new Edge Functions:

```bash
supabase functions deploy get-crm-user-statuses
supabase functions deploy reset-crm-user-password
```

Make sure the Supabase Auth URL configuration allows your CRM URL for password-reset redirects. The implementation accepts the production GitHub Pages URL and localhost/127.0.0.1 during local development.
