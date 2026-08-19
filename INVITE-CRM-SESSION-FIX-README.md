# CRM Supabase invitation/session fix

Applied fixes:
- Invitation links now establish/verify the invited Supabase session before showing Create your password.
- An invitation opened while another CRM user is logged in no longer uses the old user's session.
- Supabase implicit access-token invitations are verified against the authenticated user id.
- PKCE invitation codes are not exchanged twice if Supabase has already consumed them.
- A sessionStorage marker binds the password setup screen to the invited user across refreshes.
- Password creation verifies that the active session still belongs to the invited user immediately before updateUser().
- Expired/missing invitation URLs never fall through to the normal CRM app using an unrelated old session.
- Successful invite setup clears the invitation marker and invite URL.
- Normal login clears stale invitation state.
- admin-crm.js cache version bumped to crm-v21.

Important:
This intentionally does not delete/disable the old Supabase Auth account. A previous user's credentials remain valid in a fresh browser session unless an administrator explicitly deactivates/deletes that account. The fix prevents the old authenticated browser session from being reused during a new invitation flow.
