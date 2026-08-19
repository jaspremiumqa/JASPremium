-- ============================================================
-- Salon booking system: shared Supabase source of truth
-- Run this AFTER the existing service/category CRM setup.
-- ============================================================

create table if not exists public.bookings (
  id text primary key,
  booking_date date not null,
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','completed','cancelled','no_show')),
  customer_name text not null,
  customer_phone text not null,
  customer_email text,
  customer_notes text,
  items jsonb not null default '[]'::jsonb,
  total numeric not null default 0,
  currency text not null default 'USD'
    check (currency in ('USD','QAR')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_date_idx on public.bookings(booking_date);
create index if not exists bookings_status_idx on public.bookings(status);

alter table public.bookings enable row level security;

-- CRM: authenticated users already authorized through admin_users can read/update.
drop policy if exists "crm_admin_select_bookings" on public.bookings;
create policy "crm_admin_select_bookings"
on public.bookings
for select
to authenticated
using (public.is_admin());

drop policy if exists "crm_admin_update_bookings" on public.bookings;
create policy "crm_admin_update_bookings"
on public.bookings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Do not expose customer PII to anonymous visitors.
drop policy if exists "public_select_bookings" on public.bookings;
drop policy if exists "public_insert_bookings" on public.bookings;

-- Public availability endpoint: only returns occupied appointment slots,
-- never customer information.
drop function if exists public.get_booked_slots(date,date);

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
  cross join lateral jsonb_array_elements(b.items) item
  where b.booking_date between p_from and p_to
    and b.status = 'confirmed';
$$;

revoke all on function public.get_booked_slots(date,date) from public;
grant execute on function public.get_booked_slots(date,date) to anon, authenticated;

-- Public booking creation. This function is intentionally the only public
-- write path. It validates the appointment and checks overlaps in the DB.
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

  if p_status not in ('pending','confirmed') then
    raise exception 'INVALID_BOOKING_STATUS';
  end if;

  if p_currency not in ('USD','QAR') then
    raise exception 'INVALID_CURRENCY';
  end if;

  -- Serialize booking writes for the same date to prevent race conditions
  -- when two customers submit the same slot at nearly the same time.
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

    select b.id into conflict_id
    from public.bookings b
    cross join lateral jsonb_array_elements(b.items) existing
    where b.booking_date = p_booking_date
      and b.status = 'confirmed'
      and (existing->>'start')::time < (incoming->>'end')::time
      and (existing->>'end')::time > (incoming->>'start')::time
    limit 1;

    if conflict_id is not null then
      raise exception 'TIME_SLOT_UNAVAILABLE';
    end if;
  end loop;

  insert into public.bookings(
    id,booking_date,status,customer_name,customer_phone,
    customer_email,customer_notes,items,total,currency
  )
  values(
    p_id,p_booking_date,p_status,p_customer_name,p_customer_phone,
    nullif(p_customer_email,''),nullif(p_customer_notes,''),
    p_items,coalesce(p_total,0),p_currency
  );

  return jsonb_build_object(
    'id',p_id,
    'date',p_booking_date,
    'status',p_status
  );
end;
$$;

revoke all on function public.create_public_booking(text,date,text,text,text,text,text,jsonb,numeric,text) from public;
grant execute on function public.create_public_booking(text,date,text,text,text,text,text,jsonb,numeric,text) to anon, authenticated;

-- Keep updated_at current for CRM changes.
create or replace function public.set_booking_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
before update on public.bookings
for each row execute function public.set_booking_updated_at();

-- Verify:
-- select * from public.bookings order by created_at desc;
-- select * from public.get_booked_slots(current_date,current_date+30);
