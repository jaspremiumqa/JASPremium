# Voucher CRM Fix — v10

Run `VOUCHER-CRM-PERMISSIONS-FIX.sql` once in Supabase SQL Editor.

This fixes three voucher-management behaviors:

1. The CRM can see **inactive vouchers** as well as active vouchers. The public website still sees only active vouchers.
2. Creating vouchers uses a permission-checked RPC instead of relying on a direct browser INSERT RLS path.
3. Deleting vouchers uses a permission-checked RPC instead of relying on a direct browser DELETE RLS path.

The existing `crm_update_voucher` and image-path RPCs are also aligned with the role permission system.

After running the SQL, deploy the project and hard refresh (`Ctrl + Shift + R`).
