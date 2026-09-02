-- ============================================================
-- Voucher CRM permissions + active/inactive visibility fix
--
-- The public website must only see active vouchers.
-- The CRM must see ALL vouchers, including inactive ones, so an admin/manager
-- can edit an inactive voucher and activate it again later.
--
-- All CRM voucher mutations use permission-checked SECURITY DEFINER RPCs.
-- This also avoids browser INSERT/DELETE RLS mismatches and makes the
-- voucher module work with custom CRM roles.
--
-- Run once in Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- CRM list: returns ACTIVE + INACTIVE vouchers
-- ------------------------------------------------------------
create or replace function public.crm_list_vouchers()
returns setof public.vouchers
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.crm_has_permission('vouchers', 'read') then
    raise exception 'Not authorized to read vouchers';
  end if;

  return query
  select v.*
  from public.vouchers v
  order by v.sort_order nulls last, v.created_at desc nulls last, v.id desc;
end;
$$;

-- ------------------------------------------------------------
-- CRM create
-- ------------------------------------------------------------
create or replace function public.crm_create_voucher(
  p_sku text,
  p_title_en text,
  p_title_ar text,
  p_price_usd numeric,
  p_price_qar numeric,
  p_duration_minutes integer,
  p_active boolean
)
returns setof public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vouchers;
begin
  if not public.crm_has_permission('vouchers', 'create') then
    raise exception 'Not authorized to create vouchers';
  end if;

  if nullif(trim(p_sku), '') is null then
    raise exception 'Voucher SKU is required';
  end if;

  if nullif(trim(p_title_en), '') is null then
    raise exception 'Voucher English title is required';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 1 then
    raise exception 'Voucher duration must be at least 1 minute';
  end if;

  insert into public.vouchers (
    sku,
    title_en,
    title_ar,
    price_usd,
    price_qar,
    duration_minutes,
    active
  ) values (
    trim(p_sku),
    trim(p_title_en),
    nullif(trim(coalesce(p_title_ar, '')), ''),
    p_price_usd,
    p_price_qar,
    p_duration_minutes,
    coalesce(p_active, true)
  )
  returning * into v_row;

  return next v_row;
end;
$$;

-- ------------------------------------------------------------
-- CRM update
-- ------------------------------------------------------------
create or replace function public.crm_update_voucher(
  p_id bigint,
  p_sku text,
  p_title_en text,
  p_title_ar text,
  p_price_usd numeric,
  p_price_qar numeric,
  p_duration_minutes integer,
  p_active boolean
)
returns setof public.vouchers
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.crm_has_permission('vouchers', 'update') then
    raise exception 'Not authorized to update vouchers';
  end if;

  if nullif(trim(p_sku), '') is null then
    raise exception 'Voucher SKU is required';
  end if;

  if nullif(trim(p_title_en), '') is null then
    raise exception 'Voucher English title is required';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 1 then
    raise exception 'Voucher duration must be at least 1 minute';
  end if;

  return query
  update public.vouchers
  set
    sku = trim(p_sku),
    title_en = trim(p_title_en),
    title_ar = nullif(trim(coalesce(p_title_ar, '')), ''),
    price_usd = p_price_usd,
    price_qar = p_price_qar,
    duration_minutes = p_duration_minutes,
    active = coalesce(p_active, true)
  where id = p_id
  returning *;
end;
$$;

-- ------------------------------------------------------------
-- CRM image-path update
-- ------------------------------------------------------------
create or replace function public.crm_set_voucher_image_path(
  p_id bigint,
  p_image_path text
)
returns setof public.vouchers
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.crm_has_permission('vouchers', 'update') then
    raise exception 'Not authorized to update voucher images';
  end if;

  return query
  update public.vouchers
  set image_path = nullif(trim(coalesce(p_image_path, '')), '')
  where id = p_id
  returning *;
end;
$$;

-- ------------------------------------------------------------
-- CRM delete
-- ------------------------------------------------------------
create or replace function public.crm_delete_voucher(p_id bigint)
returns setof public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vouchers;
begin
  if not public.crm_has_permission('vouchers', 'delete') then
    raise exception 'Not authorized to delete vouchers';
  end if;

  delete from public.vouchers
  where id = p_id
  returning * into v_row;

  if not found then
    raise exception 'Voucher not found';
  end if;

  return next v_row;
exception
  when foreign_key_violation then
    raise exception 'This voucher cannot be deleted because it is already referenced by a booking. Deactivate it instead.';
end;
$$;

-- ------------------------------------------------------------
-- Function permissions
-- ------------------------------------------------------------
revoke all on function public.crm_list_vouchers() from public;
revoke all on function public.crm_create_voucher(text,text,text,numeric,numeric,integer,boolean) from public;
revoke all on function public.crm_update_voucher(bigint,text,text,text,numeric,numeric,integer,boolean) from public;
revoke all on function public.crm_set_voucher_image_path(bigint,text) from public;
revoke all on function public.crm_delete_voucher(bigint) from public;

grant execute on function public.crm_list_vouchers() to authenticated;
grant execute on function public.crm_create_voucher(text,text,text,numeric,numeric,integer,boolean) to authenticated;
grant execute on function public.crm_update_voucher(bigint,text,text,text,numeric,numeric,integer,boolean) to authenticated;
grant execute on function public.crm_set_voucher_image_path(bigint,text) to authenticated;
grant execute on function public.crm_delete_voucher(bigint) to authenticated;

-- ------------------------------------------------------------
-- Keep direct table RLS aligned with the role system too.
-- These policies are useful for any remaining direct access and for safety,
-- while the CRM itself uses the RPCs above.
-- ------------------------------------------------------------
alter table public.vouchers enable row level security;

drop policy if exists "crm_admin_select_vouchers" on public.vouchers;
create policy "crm_admin_select_vouchers"
on public.vouchers
for select
to authenticated
using (public.crm_has_permission('vouchers', 'read'));

drop policy if exists "crm_admin_insert_vouchers" on public.vouchers;
create policy "crm_admin_insert_vouchers"
on public.vouchers
for insert
to authenticated
with check (public.crm_has_permission('vouchers', 'create'));

drop policy if exists "crm_admin_update_vouchers" on public.vouchers;
create policy "crm_admin_update_vouchers"
on public.vouchers
for update
to authenticated
using (public.crm_has_permission('vouchers', 'update'))
with check (public.crm_has_permission('vouchers', 'update'));

drop policy if exists "crm_admin_delete_vouchers" on public.vouchers;
create policy "crm_admin_delete_vouchers"
on public.vouchers
for delete
to authenticated
using (public.crm_has_permission('vouchers', 'delete'));

-- Public website policy remains intentionally limited to active vouchers.
drop policy if exists "public_select_active_vouchers" on public.vouchers;
create policy "public_select_active_vouchers"
on public.vouchers
for select
to anon, authenticated
using (active = true);

-- ------------------------------------------------------------
-- Storage permissions should follow voucher permissions too.
-- ------------------------------------------------------------
drop policy if exists "crm_admin_upload_voucher_images" on storage.objects;
create policy "crm_admin_upload_voucher_images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vouchers'
  and public.crm_has_permission('vouchers', 'create')
);

drop policy if exists "crm_admin_update_voucher_images" on storage.objects;
create policy "crm_admin_update_voucher_images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vouchers'
  and public.crm_has_permission('vouchers', 'update')
)
with check (
  bucket_id = 'vouchers'
  and public.crm_has_permission('vouchers', 'update')
);

drop policy if exists "crm_admin_delete_voucher_images" on storage.objects;
create policy "crm_admin_delete_voucher_images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'vouchers'
  and public.crm_has_permission('vouchers', 'delete')
);

-- Verification examples:
-- select * from public.crm_list_vouchers();
-- select public.crm_has_permission('vouchers','create');
-- select public.crm_has_permission('vouchers','update');
-- select public.crm_has_permission('vouchers','delete');
