-- ============================================================
-- Service catalog rules + safe CRM deletes
-- ============================================================
-- Run once in Supabase SQL Editor.
--
-- Rules:
--   * Service SKU is required for new/updated services.
--   * Service SKU is unique within each category (case-insensitive, trimmed).
--   * At least one of USD or QAR price must be supplied.
--   * Services can be deleted only when they are not referenced by bookings.
--   * Categories can be deleted only after all services in them are deleted.
--   * CRM CRUD is protected by the role/permission system.
-- ============================================================

-- 1) Validate new/updated service rows.
create or replace function public.validate_crm_service_row()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.sku, '')), '') is null then
    raise exception 'Service SKU is required';
  end if;

  new.sku := trim(new.sku);

  if new.price_usd is null and new.price_qar is null then
    raise exception 'At least one service price (USD or QAR) is required';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_crm_service_row on public.services;
create trigger trg_validate_crm_service_row
before insert or update of sku, price_usd, price_qar
on public.services
for each row
execute function public.validate_crm_service_row();

-- 2) Unique service SKU within each category, ignoring case and whitespace.
-- This allows the same generated sequence to exist in different categories.
drop index if exists public.services_sku_unique_ci;

create unique index if not exists services_category_sku_unique_ci
on public.services (category_id, lower(trim(sku)))
where sku is not null and trim(sku) <> '';

-- 3) Enforce the price rule for future inserts/updates at the database level.
alter table public.services drop constraint if exists services_at_least_one_price;
alter table public.services
  add constraint services_at_least_one_price
  check (price_usd is not null or price_qar is not null)
  not valid;

-- 4) Replace the old admin-only service policies with role permissions.
drop policy if exists "crm_admin_select_services" on public.services;
drop policy if exists "crm_admin_insert_services" on public.services;
drop policy if exists "crm_admin_update_services" on public.services;
drop policy if exists "crm_admin_delete_services" on public.services;

drop policy if exists "crm_permission_select_services" on public.services;
drop policy if exists "crm_permission_insert_services" on public.services;
drop policy if exists "crm_permission_update_services" on public.services;
drop policy if exists "crm_permission_delete_services" on public.services;

create policy "crm_permission_select_services"
on public.services
for select
to authenticated
using (public.crm_has_permission('services', 'read'));

create policy "crm_permission_insert_services"
on public.services
for insert
to authenticated
with check (public.crm_has_permission('services', 'create'));

create policy "crm_permission_update_services"
on public.services
for update
to authenticated
using (public.crm_has_permission('services', 'update'))
with check (public.crm_has_permission('services', 'update'));

create policy "crm_permission_delete_services"
on public.services
for delete
to authenticated
using (public.crm_has_permission('services', 'delete'));

-- 5) Replace the old category policies with role permissions.
drop policy if exists "crm_admin_select_categories" on public.service_categories;
drop policy if exists "crm_admin_insert_categories" on public.service_categories;
drop policy if exists "crm_admin_update_categories" on public.service_categories;
drop policy if exists "crm_admin_delete_categories" on public.service_categories;

drop policy if exists "crm_permission_select_categories" on public.service_categories;
drop policy if exists "crm_permission_insert_categories" on public.service_categories;
drop policy if exists "crm_permission_update_categories" on public.service_categories;
drop policy if exists "crm_permission_delete_categories" on public.service_categories;

create policy "crm_permission_select_categories"
on public.service_categories
for select
to authenticated
using (public.crm_has_permission('services', 'read'));

create policy "crm_permission_insert_categories"
on public.service_categories
for insert
to authenticated
with check (public.crm_has_permission('services', 'create'));

create policy "crm_permission_update_categories"
on public.service_categories
for update
to authenticated
using (public.crm_has_permission('services', 'update'))
with check (public.crm_has_permission('services', 'update'));

create policy "crm_permission_delete_categories"
on public.service_categories
for delete
to authenticated
using (public.crm_has_permission('services', 'delete'));

-- 6) Helpful verification queries.
-- select sku, count(*) from public.services group by lower(trim(sku)), sku having count(*) > 1;
-- select id, sku, price_usd, price_qar from public.services where sku is null or trim(sku) = '' or (price_usd is null and price_qar is null);
