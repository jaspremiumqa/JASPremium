-- ============================================================
-- Move FAQ page title/description into the unified translation catalogue.
-- Run once in the Supabase SQL Editor after TRANSLATIONS-CRM-MIGRATION.sql.
-- ============================================================

begin;

insert into public.site_translations (key, en, ar, description)
select
  'faq.pageTitle',
  coalesce(title_en, ''),
  coalesce(title_ar, ''),
  'FAQ page title'
from public.faq_settings
where id = 1
on conflict (key) do nothing;

insert into public.site_translations (key, en, ar, description)
select
  'faq.pageDescription',
  coalesce(description_en, ''),
  coalesce(description_ar, ''),
  'FAQ page description'
from public.faq_settings
where id = 1
on conflict (key) do nothing;

-- Defaults when no legacy FAQ settings row exists yet.
insert into public.site_translations (key, en, ar, description)
values
  ('faq.pageTitle', 'Frequently Asked Questions', 'الأسئلة الشائعة', 'FAQ page title'),
  ('faq.pageDescription', 'Find answers to the most common questions about our services and bookings.', 'اعثري على إجابات لأكثر الأسئلة شيوعاً حول خدماتنا والحجوزات.', 'FAQ page description')
on conflict (key) do nothing;

commit;

-- The CRM now edits these two rows alongside every other translation:
-- select key, en, ar from public.site_translations where key like 'faq.%';
