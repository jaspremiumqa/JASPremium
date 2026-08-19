# Booking CRM test

This first Booking CRM iteration is connected to the current test booking store used by the booking website:

- `localStorage.salonTestBookings` is the live test source.
- CRM bookings are read from Supabase. A browser-local cache may be used for existing local/test bookings when Supabase cannot be read.
- The CRM resolves service names and voucher names from Supabase. Voucher images are stored in the public Supabase `vouchers` Storage bucket.
- Status changes made in the CRM are written back to `localStorage.salonTestBookings`, so cancelled bookings will stop blocking the booking-time selector on the same browser.

This is intentionally a test-stage implementation. It does not yet make Supabase the shared booking database for all devices. The next backend step should be a protected bookings table/Edge Function so public customers can create bookings without exposing write access to the table, while CRM staff can manage them securely.
