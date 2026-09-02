-- ============================================================
-- Repair existing service SKUs to match category-only numbering
-- ============================================================
-- Example:
--   Eyebrows -> E-001, E-002, ...
--   Hair Styles -> HS-001, HS-002, ...
--   Hair Treatments -> HT-001, HT-002, ...
--
-- Run once after SERVICE-SKU-PER-CATEGORY.sql. Existing service rows
-- are renumbered by service id within each category. This does not
-- change service IDs or booking relationships.

begin;

-- Move every current SKU out of the way first so the unique index cannot
-- collide while rows are being normalized.
update public.services
set sku = 'TMP-SKU-' || id::text;

with ranked as (
  select
    s.id,
    public.crm_service_sku_prefix(s.category_id) as prefix,
    row_number() over (partition by s.category_id order by s.id asc) as seq
  from public.services s
)
update public.services s
set sku = ranked.prefix || '-' || lpad(ranked.seq::text, 3, '0')
from ranked
where s.id = ranked.id;

commit;
