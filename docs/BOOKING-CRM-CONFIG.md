# Booking CRM configuration

The CRM includes an admin-only **Booking Setup** section.

## Weekly schedule

`public.booking_settings` controls two schedules:

- **Monday-Friday**: `weekday_slot_minutes`, `weekday_opening_time`, `weekday_closing_time`
- **Saturday-Sunday**: `weekend_slot_minutes`, `weekend_opening_time`, `weekend_closing_time`

`advance_months` controls how far ahead customers can book.

The public booking calendar chooses the correct schedule from the selected date. The slot interval controls the spacing of possible **start times**; the selected service duration still controls the appointment end time.

## Calendar blocks

`public.booking_blackouts` stores exact start/end date-times. These are timezone-safe local wall-clock values and must satisfy `ends_at > starts_at`.

## Website contact phone

The public contact phone is stored in `public.application_settings` under `contact_phone`. It is managed in CRM > Application Settings and is used by the homepage contact section and navigation phone link.

## Setup

Run:

1. `supabase/sql/BOOKING-SETTINGS-SETUP.sql`
2. `supabase/sql/BOOKING-WEEKEND-WEEKDAY-MIGRATION.sql` on an existing installation if the new schedule columns are not present.
3. `supabase/sql/APPLICATION-SETTINGS-SEED.sql`

The migration preserves the existing weekday opening/closing/slot values and defaults weekends to 10:00-16:00 with 30-minute start intervals.
