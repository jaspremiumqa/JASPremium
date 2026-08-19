-- Application settings RLS
-- Public website: read active settings.
-- CRM administrators: insert/update/delete settings.
--
-- Run this once in Supabase SQL Editor.

ALTER TABLE public.application_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_active_application_settings"
ON public.application_settings;

CREATE POLICY "public_read_active_application_settings"
ON public.application_settings
FOR SELECT
TO anon, authenticated
USING (active = true);

DROP POLICY IF EXISTS "admins_manage_application_settings"
ON public.application_settings;

CREATE POLICY "admins_manage_application_settings"
ON public.application_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
      AND au.role = 'admin'
      AND au.active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
      AND au.role = 'admin'
      AND au.active = true
  )
);
