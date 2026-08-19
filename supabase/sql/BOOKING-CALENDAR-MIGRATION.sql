-- Booking calendar cleanup
-- The CRM calendar now consists only of an exact start and end date/time.
-- Every saved block is a closure; there is no type/reason field.
--
-- IMPORTANT: the application treats starts_at/ends_at as local wall-clock
-- values. New values are written with the selected clock components preserved.
-- This avoids browser/Supabase timezone shifts.
--
-- Run after BOOKING-SETTINGS-SETUP.sql.
alter table if exists public.booking_blackouts
  drop column if exists closed,
  drop column if exists reason;

alter table if exists public.booking_blackouts
  drop constraint if exists booking_blackouts_range_chk;

alter table if exists public.booking_blackouts
  add constraint booking_blackouts_range_chk
  check (ends_at > starts_at);
