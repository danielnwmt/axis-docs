DROP POLICY IF EXISTS "Admins read license config" ON public.license_config;
CREATE POLICY "Authenticated read license config" ON public.license_config
  FOR SELECT TO authenticated USING (true);