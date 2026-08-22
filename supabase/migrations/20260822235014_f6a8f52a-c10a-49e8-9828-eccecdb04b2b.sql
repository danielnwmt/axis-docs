CREATE POLICY org_insert_owner ON public.organizations FOR INSERT TO authenticated WITH CHECK (public.is_platform_owner(auth.uid()));
CREATE POLICY org_update_owner ON public.organizations FOR UPDATE TO authenticated USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));
GRANT INSERT, UPDATE ON public.organizations TO authenticated;