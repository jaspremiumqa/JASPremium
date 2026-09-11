-- JASPremium service SKU repair
-- Run once in Supabase SQL Editor BEFORE creating new services.
-- This makes service SKUs unique globally (not once per category).
-- Example: Hair Cut = HC-001, Hair Color = HC-002.

BEGIN;

-- Temporarily move duplicate SKUs out of the way so this also works
-- when the current database has a category_id + sku unique constraint.
WITH ranked AS (
  SELECT id, sku,
         row_number() OVER (
           PARTITION BY lower(trim(sku))
           ORDER BY id
         ) AS rn
  FROM public.services
  WHERE NULLIF(trim(sku), '') IS NOT NULL
), duplicates AS (
  SELECT id
  FROM ranked
  WHERE rn > 1
)
UPDATE public.services s
SET sku = '__JAS_SKU_FIX__' || s.id
WHERE s.id IN (SELECT id FROM duplicates);

-- Give every repaired duplicate the next available number for its
-- category-derived prefix, while preserving the first existing SKU.
DO $$
DECLARE
  r record;
  prefix text;
  next_no integer;
  new_sku text;
BEGIN
  FOR r IN
    SELECT s.id, s.category_id, c.name_en
    FROM public.services s
    LEFT JOIN public.service_categories c ON c.id = s.category_id
    WHERE s.sku LIKE '__JAS_SKU_FIX__%'
    ORDER BY s.id
  LOOP
    prefix := CASE
      WHEN array_length(regexp_split_to_array(trim(coalesce(r.name_en,'')), '\\s+'), 1) = 1
        THEN upper(left(regexp_replace(trim(coalesce(r.name_en,'')), '[^A-Za-z0-9]', '', 'g'), 1))
      ELSE upper(
        (SELECT string_agg(left(x,1), '' ORDER BY ord)
         FROM unnest(regexp_split_to_array(trim(coalesce(r.name_en,'')), '\\s+')) WITH ORDINALITY AS t(x,ord)
         WHERE x <> '')
    END;

    IF prefix IS NULL OR prefix = '' THEN
      prefix := 'S';
    END IF;

    SELECT COALESCE(max((regexp_match(sku, '^' || regexp_replace(prefix,'([\\.\\+\\*\\?\\[\\]\\(\\)\\{\\}\|\\^\\$])','\\\\1','g') || '-([0-9]+)$'))[1]::integer),0) + 1
      INTO next_no
    FROM public.services
    WHERE sku ~ ('^' || prefix || '-[0-9]+$');

    LOOP
      new_sku := prefix || '-' || lpad(next_no::text,3,'0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.services x
        WHERE lower(x.sku) = lower(new_sku)
      );
      next_no := next_no + 1;
    END LOOP;

    UPDATE public.services
    SET sku = new_sku
    WHERE id = r.id;
  END LOOP;
END $$;

-- Prevent future duplicate service SKUs regardless of category.
CREATE UNIQUE INDEX IF NOT EXISTS services_sku_global_unique_idx
  ON public.services (lower(trim(sku)))
  WHERE NULLIF(trim(sku), '') IS NOT NULL;

COMMIT;
