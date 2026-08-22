ALTER TABLE public.documents          ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.units              ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.categories         ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.audit_logs         ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.backup_settings    ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.backup_files       ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.retention_policies ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.user_certificates  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.dpo_config         ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.consents           ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.data_requests      ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.privacy_incidents  ALTER COLUMN org_id SET DEFAULT public.current_org_id();
ALTER TABLE public.organization_invites ALTER COLUMN org_id SET DEFAULT public.current_org_id();

CREATE POLICY drive_owner_read ON public.organization_drive_config FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()));