-- ============================================================
-- Service SKU numbering: generated from category name only
-- ============================================================
-- Example: Hair Styles -> HS-001, HS-002, HS-003
-- A one-word category uses its first letter: Treatments -> T-001.
-- Numbering restarts for each category. The SKU is not user-editable.

create or replace function public.crm_service_sku_prefix(p_category_id bigint)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  category_name text;
  words text[];
  prefix text := '';
  word text;
begin
  select name_en into category_name
  from public.service_categories
  where id = p_category_id;

  words := regexp_split_to_array(trim(coalesce(category_name, '')), '[^A-Za-z0-9]+');
  if coalesce(array_length(words, 1), 0) = 0 then
    return '';
  end if;

  if array_length(words, 1) = 1 then
    return upper(left(words[1], 1));
  end if;

  foreach word in array words loop
    if word <> '' then prefix := prefix || upper(left(word, 1)); end if;
  end loop;
  return prefix;
end;
$$;

create or replace function public.generate_crm_service_sku()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  prefix text;
  next_number integer;
  candidate text;
begin
  -- Generate on insert, and regenerate when the category changes.
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    perform pg_advisory_xact_lock(hashtextextended('service-sku:' || coalesce(new.category_id::text, ''), 0));

    prefix := public.crm_service_sku_prefix(new.category_id);
    if prefix = '' then
      raise exception 'A valid English service category name is required to generate the SKU';
    end if;

    select coalesce(max((regexp_match(s.sku, '-([0-9]+)$'))[1]::integer), 0) + 1
      into next_number
    from public.services s
    where s.category_id = new.category_id
      and s.id <> coalesce(new.id, -1);

    candidate := prefix || '-' || lpad(next_number::text, 3, '0');
    while exists (
      select 1 from public.services s
      where s.category_id = new.category_id
        and lower(trim(s.sku)) = lower(candidate)
        and s.id <> coalesce(new.id, -1)
    ) loop
      next_number := next_number + 1;
      candidate := prefix || '-' || lpad(next_number::text, 3, '0');
    end loop;

    new.sku := candidate;
  else
    -- The SKU is immutable while the service remains in the same category.
    new.sku := old.sku;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_generate_crm_service_sku on public.services;
create trigger trg_generate_crm_service_sku
before insert or update of category_id
on public.services
for each row
execute function public.generate_crm_service_sku();

-- Unique within each category, case-insensitive.
drop index if exists public.services_sku_unique_ci;
create unique index if not exists services_category_sku_unique_ci
on public.services (category_id, lower(trim(sku)))
where sku is not null and trim(sku) <> '';
