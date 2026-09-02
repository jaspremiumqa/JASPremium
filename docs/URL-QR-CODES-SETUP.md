# URL QR Codes

The CRM URL QR Codes section creates permanent QR identities for any HTTP/HTTPS URL. The QR does **not** encode the destination URL. It encodes the stable public JAS Premium resolver plus a permanent code.

## Important

The resolver is intentionally fixed to:

`https://jaspremiumqa.github.io/JASPremium/url-redirect.html`

Do not generate QR codes from localhost, a local preview server, or a temporary deployment URL. The CRM now always encodes the fixed public resolver, even when the admin is opened locally.

## Setup

1. Run `supabase/sql/URL-QR-CODES-SETUP.sql` in Supabase.
2. Deploy `url-redirect.html` at the same public site/path as `admin.html`. The resolver uses the Supabase REST RPC directly and does not depend on the Supabase JavaScript CDN.
3. Open **URL QR Codes** in the CRM and create a QR code.
4. Scan the newly generated QR and verify it opens the current destination.

## Stability

- Changing `destination_url` does not change the permanent code or QR image.
- Existing printed QR codes continue to work after destination changes.
- Do not delete the `url_qr_codes` row or rename/remove `url-redirect.html`.
- Downloaded QR images include a white quiet zone for reliable scanning.

## Mobile / Google Maps

The resolver converts Google Maps URLs that use `?q=latitude,longitude` to the Google Maps universal `/maps/search/?api=1&query=...` format. On supported mobile devices this can hand off to the Google Maps app; otherwise Google Maps opens in the browser.
