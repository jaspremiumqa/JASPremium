-- ============================================================
-- Voucher CRM edit fix
--
-- The browser session is correctly authenticated and public.is_admin()
-- returns true. These SECURITY DEFINER RPCs make CRM voucher mutations use
-- one deterministic authorization path instead of relying on a browser
-- PATCH against the vouchers table.
--
-- Run this once in Supabase SQL Editor.
-- ============================================================

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
  if not public.is_admin() then
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
  if not public.is_admin() then
    raise exception 'Not authorized to update voucher images';
  end if;

  return query
  update public.vouchers
  set image_path = nullif(trim(coalesce(p_image_path, '')), '')
  where id = p_id
  returning *;
end;
$$;

revoke all on function public.crm_update_voucher(bigint,text,text,text,numeric,numeric,integer,boolean) from public;
grant execute on function public.crm_update_voucher(bigint,text,text,text,numeric,numeric,integer,boolean) to authenticated;

revoke all on function public.crm_set_voucher_image_path(bigint,text) from public;
grant execute on function public.crm_set_voucher_image_path(bigint,text) to authenticated;

-- Verify:
-- select public.is_admin();
-- select * from public.crm_update_voucher(5, 'V-001', 'Happy Hour 11:00AM-3:00PM', 'ساعة التخفيضات: من 11:00 صباحاً إلى 3:00 مساءً', null, null, 30, true);
