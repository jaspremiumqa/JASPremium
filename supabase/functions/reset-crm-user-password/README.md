# CRM password reset

Deploy with:

```bash
supabase functions deploy reset-crm-user-password
```

The function checks the existing `users.update` CRM permission, validates the target CRM user, and sends a Supabase password-reset email. The reset link returns to `admin.html?recovery=1`, where the user chooses a new password.
