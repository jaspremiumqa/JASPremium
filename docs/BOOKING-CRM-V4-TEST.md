# Booking CRM v4 — Availability & Overlap

- Schedule now shows exact **Available** windows between blocking appointments.
- Pending and Confirmed bookings block time.
- Cancelled bookings do not block time.
- Overlapping bookings are highlighted with a red outline and **Overlap** label.
- Changing a booking to Pending or Confirmed is rejected if it overlaps another Pending/Confirmed booking.
- This is still the JSON/localStorage test source; Supabase bookings will become the shared source of truth in the next stage.
