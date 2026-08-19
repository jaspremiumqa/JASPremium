# Salon1 - Modern Booking Test

The booking experience has been rebuilt from scratch and is now a single mobile-first `booking.html`.

## Flow
1. Select one or more services.
2. Choose a date.
3. Choose a start time. The system calculates the full appointment duration and disables conflicts.
4. Review the appointment timeline.
5. Enter customer details.
6. Receive a local test confirmation/reference.

## JSON data
- Supabase `service_categories` + `services` - live service catalogue, prices and durations. A missing/invalid duration defaults to 30 minutes.
- Supabase `booking_settings` - booking slots and calendar labels.
- Supabase `booking_schedule_rules` - opening/closed rules.
- Supabase `get_booked_slots` - live booking availability used to disable occupied slots.

A test booking is included for `2026-08-12`:
- 10:00-10:30 HS-001
- 10:30-12:00 HT-002

So 10:00, 10:30 and 11:00 starts are expected to be unavailable for an appointment that overlaps that booking.

New test bookings are stored in browser localStorage only. Static GitHub Pages cannot write back to JSON. Supabase will become the permanent source of truth later.


### Latest fix
The booking flow now waits for its JSON configuration before reacting to the site's language-change event. This prevents the `months`/`formatTime` null errors that could appear during the initial page load. Calendar navigation is also bounded by `advanceMonths` and unavailable booked times remain disabled.


### Navigation fixes
- The home page BOOK NOW CTA now opens `booking.html` directly.
- Booking Continue buttons are enabled/disabled dynamically based on selection/date/time.
- Service-page Book buttons now open the booking flow and pass the selected service SKU.


## Email notification (test)
The booking flow keeps the new local test booking behavior and also posts a booking notification to the existing Formspree endpoint used by the site contact form. If Formspree is rate-limited, the booking is still saved locally and the customer sees a warning rather than losing the booking.
