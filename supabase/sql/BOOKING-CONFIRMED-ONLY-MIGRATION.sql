-- ============================================================
-- BOOKING-CONFIRMED-ONLY-MIGRATION.sql
-- Public booking availability rules:
--   * pending requests NEVER block a time slot
--   * confirmed appointments DO block a time slot
--   * CRM can move a pending request before confirming it
--
-- Run this once in Supabase SQL Editor on an existing installation.
-- ============================================================

create or replace function public.get_booked_slots(
  p_from date,
  p_to date
)
returns table (
  booking_id text,
  booking_date date,
  status text,
  service_sku text,
  start_time text,
  end_time text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.id,
    b.booking_date,
    b.status,
    coalesce(item->>'serviceSku',''),
    item->>'start',
    item->>'end'
  from public.bookings b
  cross join lateral jsonb_array_elements(coalesce(b.items,'[]'::jsonb)) item
  where b.booking_date between p_from and p_to
    and lower(coalesce(b.status,'')) = 'confirmed';
$$;

revoke all on function public.get_booked_slots(date,date) from public;
grant execute on function public.get_booked_slots(date,date) to anon, authenticated;


drop function if exists public.create_public_booking(text,date,text,text,text,text,text,jsonb,numeric,text);

create or replace function public.create_public_booking(
  p_id text,
  p_booking_date date,
  p_status text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_notes text,
  p_items jsonb,
  p_total numeric,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
volatile
as $$
declare
  incoming jsonb;
  conflict_id text;
begin
  if nullif(trim(p_id),'') is null
     or nullif(trim(p_customer_name),'') is null
     or nullif(trim(p_customer_phone),'') is null
     or p_booking_date is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_BOOKING';
  end if;

  if lower(coalesce(p_status,'')) not in ('pending','confirmed') then
    raise exception 'INVALID_BOOKING_STATUS';
  end if;

  if p_currency not in ('USD','QAR') then
    raise exception 'INVALID_CURRENCY';
  end if;

  -- Serialize writes for the same date so two simultaneous requests
  -- cannot both pass the confirmed-overlap check.
  perform pg_advisory_xact_lock(hashtext(p_booking_date::text));

  if exists (select 1 from public.bookings where id = p_id) then
    raise exception 'BOOKING_ALREADY_EXISTS';
  end if;

  for incoming in select value from jsonb_array_elements(p_items)
  loop
    if nullif(incoming->>'start','') is null
       or nullif(incoming->>'end','') is null
       or (incoming->>'start')::time >= (incoming->>'end')::time then
      raise exception 'INVALID_BOOKING_TIME';
    end if;

    -- CRITICAL: only CONFIRMED bookings participate in this conflict check.
    -- Pending requests are intentionally allowed to overlap.
    if lower(coalesce(p_status,'pending')) = 'confirmed' then
      select b.id into conflict_id
      from public.bookings b
      cross join lateral jsonb_array_elements(coalesce(b.items,'[]'::jsonb)) existing
      where b.booking_date = p_booking_date
        and lower(coalesce(b.status,'')) = 'confirmed'
        and (existing->>'start')::time < (incoming->>'end')::time
        and (existing->>'end')::time > (incoming->>'start')::time
      limit 1;

      if conflict_id is not null then
        raise exception 'TIME_SLOT_UNAVAILABLE';
      end if;
    end if;
  end loop;

  insert into public.bookings(
    id, booking_date, status, customer_name, customer_phone,
    customer_email, customer_notes, items, total, currency
  )
  values(
    p_id, p_booking_date, lower(p_status), p_customer_name, p_customer_phone,
    nullif(p_customer_email,''), nullif(p_customer_notes,''),
    p_items, coalesce(p_total,0), p_currency
  );

  return jsonb_build_object(
    'id', p_id,
    'date', p_booking_date,
    'status', lower(p_status)
  );
end;
$$;

revoke all on function public.create_public_booking(text,date,text,text,text,text,text,jsonb,numeric,text) from public;
grant execute on function public.create_public_booking(text,date,text,text,text,text,text,jsonb,numeric,text) to anon, authenticated;


-- Database-level guard for CRM confirmation/update. This keeps the rule true
-- even if two CRM users act at nearly the same time.
create or replace function public.prevent_confirmed_booking_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  incoming jsonb;
  conflict_id text;
begin
  if lower(coalesce(new.status,'')) <> 'confirmed' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.booking_date::text));

  for incoming in
    select value from jsonb_array_elements(coalesce(new.items,'[]'::jsonb))
  loop
    select b.id into conflict_id
    from public.bookings b
    cross join lateral jsonb_array_elements(coalesce(b.items,'[]'::jsonb)) existing
    where b.id <> new.id
      and b.booking_date = new.booking_date
      and lower(coalesce(b.status,'')) = 'confirmed'
      and (existing->>'start')::time < (incoming->>'end')::time
      and (existing->>'end')::time > (incoming->>'start')::time
    limit 1;

    if conflict_id is not null then
      raise exception 'TIME_SLOT_UNAVAILABLE';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_prevent_confirmed_booking_overlap on public.bookings;

create trigger trg_prevent_confirmed_booking_overlap
before insert or update of booking_date,status,items on public.bookings
for each row
execute function public.prevent_confirmed_booking_overlap();
