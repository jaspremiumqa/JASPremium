-- ============================================================
-- Move Booking Setup text into the Translation section.
--
-- Rules:
-- 1. If the translation key already exists, keep the Translation
--    value and do not overwrite it with legacy booking text.
-- 2. If the key does not exist, create it from the legacy
--    booking_settings JSON.
-- 3. Remove the legacy text columns from booking_settings so the
--    Booking Setup section no longer stores page copy.
-- ============================================================

begin;

-- Legacy date/time messages were stored as:
-- { "back": {"en":...,"ar":...}, "title": {...}, ... }
insert into public.site_translations (key, en, ar, active)
select
  'bookingDateTime.' || field.key,
  coalesce(field.value->>'en', ''),
  coalesce(field.value->>'ar', ''),
  true
from public.booking_settings bs
cross join lateral jsonb_each(coalesce(bs.date_time_text, '{}'::jsonb)) field
where not exists (
  select 1 from public.site_translations t
  where t.key = 'bookingDateTime.' || field.key
);

-- Legacy availability messages were stored as:
-- { "en": {"closed":...}, "ar": {"closed":...} }
insert into public.site_translations (key, en, ar, active)
select
  'bookingDateTime.' || field.key,
  coalesce((bs.messages->'en')->>field.key, ''),
  coalesce((bs.messages->'ar')->>field.key, ''),
  true
from public.booking_settings bs
cross join lateral (
  select distinct key
  from (
    select jsonb_object_keys(coalesce(bs.messages->'en', '{}'::jsonb)) as key
    union
    select jsonb_object_keys(coalesce(bs.messages->'ar', '{}'::jsonb)) as key
  ) keys
) field
where not exists (
  select 1 from public.site_translations t
  where t.key = 'bookingDateTime.' || field.key
);

-- Legacy review text was stored as:
-- { "title": {"en":...}, "description": {...}, ... }
insert into public.site_translations (key, en, ar, active)
select
  'bookingReview.' || field.key,
  coalesce(field.value->>'en', ''),
  coalesce(field.value->>'ar', ''),
  true
from public.booking_settings bs
cross join lateral jsonb_each(coalesce(bs.review_text, '{}'::jsonb)) field
where not exists (
  select 1 from public.site_translations t
  where t.key = 'bookingReview.' || field.key
);

-- The Translation table is now the single source of truth for booking page copy.
alter table public.booking_settings
  drop column if exists messages,
  drop column if exists date_time_text,
  drop column if exists review_text;

commit;

-- Verification:
-- select key,en,ar from public.site_translations
-- where key like 'bookingDateTime.%' or key like 'bookingReview.%'
-- order by key;
--
-- select column_name
-- from information_schema.columns
-- where table_schema='public' and table_name='booking_settings'
-- order by ordinal_position;
