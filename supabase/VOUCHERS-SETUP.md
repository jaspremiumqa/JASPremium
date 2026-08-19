# Voucher Supabase setup

1. Open Supabase SQL Editor.
2. Run `supabase/sql/VOUCHERS-SETUP.sql`. This migration is safe to run against the older vouchers table: legacy required columns such as `name_en`/`name_ar` are made nullable because the CRM now writes `sku`, `title_en`, `title_ar`, pricing, duration and image fields.
3. Open CRM -> Vouchers.
4. The four existing voucher records are seeded as V-001 through V-004.
5. Edit each voucher and upload its image. Images are stored in the public Supabase Storage bucket named `vouchers`.
6. The website and booking flow now read vouchers from Supabase; `assets/data/vouchers.json` is no longer used.

Image rules:
- JPG, PNG, WebP, GIF or AVIF
- Maximum 5 MB
- CRM users must be active CRM users in `admin_users`
- Website visitors can only read active voucher rows
- Voucher image downloads use the public Storage URL; upload/delete remains protected by `is_admin()`
