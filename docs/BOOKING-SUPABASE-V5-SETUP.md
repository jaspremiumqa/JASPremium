# Booking Supabase v5 setup

This version moves bookings to Supabase as the shared source of truth.

## 1. Run the SQL

In Supabase SQL Editor, run:

`supabase/sql/CRM-SUPABASE-BOOKINGS.sql`

This creates `public.bookings`, RLS, a public availability RPC, and a protected public booking-creation RPC.

## 2. Test the website

Make a new booking.

The website:
- checks the current Supabase occupied slots,
- creates the booking through `create_public_booking`,
- rejects a race/overlap at database level,
- keeps a local cache only for test fallback,
- then sends the existing Formspree notification.

## 3. Test the CRM

Log into the CRM and open Bookings.

The CRM now reads `public.bookings` first. It falls back to the old local/JSON test data only if the database is unavailable or empty.

Changing Pending/Confirmed/Completed/Cancelled writes the status to Supabase.

## 4. Important behavior

- Pending and Confirmed block time for public availability.
- Cancelled and Completed do not block new customer bookings.
- Customer PII is NOT exposed through the public availability RPC.
- Public visitors cannot directly insert/select the bookings table; they can only call the controlled RPC.
- CRM admins can read/update bookings through RLS.

## 5. Existing JSON

Booking availability is read from the Supabase `get_booked_slots` RPC. There is no JSON booking fallback.
