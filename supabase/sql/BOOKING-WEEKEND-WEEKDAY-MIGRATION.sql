-- Weekday / weekend booking schedule
-- Run this once on an existing database.
-- Monday-Friday use weekday_*; Saturday-Sunday use weekend_*.

alter table if exists public.booking_settings
  add column if not exists weekday_slot_minutes integer,
  add column if not exists weekday_opening_time time,
  add column if not exists weekday_closing_time time,
  add column if not exists weekend_slot_minutes integer,
  add column if not exists weekend_opening_time time,
  add column if not exists weekend_closing_time time;

update public.booking_settings
set
  weekday_slot_minutes = coalesce(weekday_slot_minutes, slot_minutes, 30),
  weekday_opening_time = coalesce(weekday_opening_time, opening_time, '09:00'::time),
  weekday_closing_time = coalesce(weekday_closing_time, closing_time, '18:00'::time),
  weekend_slot_minutes = coalesce(weekend_slot_minutes, 30),
  weekend_opening_time = coalesce(weekend_opening_time, '10:00'::time),
  weekend_closing_time = coalesce(weekend_closing_time, '16:00'::time)
where id = 1;

alter table public.booking_settings
  alter column weekday_slot_minutes set default 30,
  alter column weekday_opening_time set default '09:00',
  alter column weekday_closing_time set default '18:00',
  alter column weekend_slot_minutes set default 30,
  alter column weekend_opening_time set default '10:00',
  alter column weekend_closing_time set default '16:00',
  alter column weekday_slot_minutes set not null,
  alter column weekday_opening_time set not null,
  alter column weekday_closing_time set not null,
  alter column weekend_slot_minutes set not null,
  alter column weekend_opening_time set not null,
  alter column weekend_closing_time set not null;

alter table public.booking_settings
  drop constraint if exists booking_weekday_time_range_chk,
  drop constraint if exists booking_weekend_time_range_chk;

alter table public.booking_settings
  add constraint booking_weekday_time_range_chk
    check (weekday_closing_time > weekday_opening_time),
  add constraint booking_weekend_time_range_chk
    check (weekend_closing_time > weekend_opening_time);

-- Keep legacy values aligned with Monday-Friday for older integrations.
update public.booking_settings
set
  slot_minutes = weekday_slot_minutes,
  opening_time = weekday_opening_time,
  closing_time = weekday_closing_time
where id = 1;
