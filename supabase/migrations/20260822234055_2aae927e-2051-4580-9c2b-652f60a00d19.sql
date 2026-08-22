-- ============ 1. Core SaaS tables ============
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'trial',
  status text NOT NULL DEFAULT 'active',
  trial_ends_at timestamptz,
  storage_limit_gb numeric NOT NULL DEFAULT 5,
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  max_users integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.platform_owners (
  user_id uuid NOT NULL PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_owners TO authenticated;
GRANT ALL ON public.platform_owners TO service_role;
ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_drive_config (
  org_id uuid NOT NULL PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  service_account_json text,
  root_folder_id text,
  configured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.organization_drive_config TO service_role;
ALTER TABLE public.organization_drive_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'Usuário',
  unit text NOT NULL DEFAULT 'Geral',
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  invited_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invites TO authenticated;
GRANT ALL ON public.organization_invites TO service_role;
ALTER TABLE public.organization_invites ENABLE ROW LEVEL SECURITY;

-- ============ 2. org_id columns ============
ALTER TABLE public.profiles              ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.documents             ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.units                 ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.categories            ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.audit_logs            ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.backup_settings       ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.backup_files          ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.retention_policies    ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.user_certificates     ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.dpo_config            ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.consents              ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.data_requests         ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.privacy_incidents     ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ============ 3. Seed default org + backfill ============
INSERT INTO public.organizations (name, slug, plan, status, storage_limit_gb, max_users)
VALUES ('Organização Padrão', 'default', 'pro', 'active', 100, 100);

DO $$
DECLARE _org uuid;
BEGIN
  SELECT id INTO _org FROM public.organizations WHERE slug = 'default';
  UPDATE public.profiles           SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.documents          SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.units              SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.categories         SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.audit_logs         SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.backup_settings    SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.backup_files       SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.retention_policies SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.user_certificates  SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.dpo_config         SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.consents           SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.data_requests      SET org_id = _org WHERE org_id IS NULL;
  UPDATE public.privacy_incidents  SET org_id = _org WHERE org_id IS NULL;
  INSERT INTO public.organization_drive_config (org_id) VALUES (_org);
  INSERT INTO public.platform_owners (user_id)
    SELECT id FROM public.profiles WHERE role = 'Administrador'
    ON CONFLICT DO NOTHING;
END $$;

ALTER TABLE public.profiles        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.documents       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.units           ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.categories      ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX idx_profiles_org   ON public.profiles(org_id);
CREATE INDEX idx_documents_org  ON public.documents(org_id);
CREATE INDEX idx_units_org      ON public.units(org_id);
CREATE INDEX idx_categories_org ON public.categories(org_id);
CREATE INDEX idx_audit_org      ON public.audit_logs(org_id);
CREATE INDEX idx_invites_email  ON public.organization_invites(lower(email));

-- ============ 4. Helper functions ============
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid() AND active = true
$$;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_owners WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND active = true AND role = 'Administrador'
  )
$$;

REVOKE ALL ON FUNCTION public.current_org_id() FROM public, anon;
REVOKE ALL ON FUNCTION public.is_platform_owner(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated, service_role;

-- audit log with org
CREATE OR REPLACE FUNCTION public.insert_audit_log(_action text, _action_type text DEFAULT 'other', _target text DEFAULT '', _details text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid := auth.uid(); _user_email text; _org uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;
  SELECT org_id INTO _org FROM public.profiles WHERE id = _user_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details, org_id)
  VALUES (_user_id, COALESCE(_user_email, ''), _action, _action_type, _target, _details, _org);
END;
$$;

-- block self-escalation incl. org
CREATE OR REPLACE FUNCTION public.prevent_profile_sensitive_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.org_id IS DISTINCT FROM NEW.org_id AND NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Organization cannot be changed';
  END IF;
  IF OLD.role IS DISTINCT FROM NEW.role AND NOT public.is_org_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can change user roles';
  END IF;
  IF OLD.unit IS DISTINCT FROM NEW.unit AND NOT public.is_org_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can change user units';
  END IF;
  RETURN NEW;
END;
$$;

-- ============ 5. Rewrite RLS, org-scoped ============
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','documents','units','categories','audit_logs','backup_settings','backup_files','retention_policies','user_certificates','dpo_config','consents','data_requests','privacy_incidents','license_config','system_updates'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- organizations
CREATE POLICY org_read ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_org_id() OR public.is_platform_owner(auth.uid()));

-- platform_owners
CREATE POLICY po_read ON public.platform_owners FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_owner(auth.uid()));

-- drive config: service_role only (no policies for authenticated)

-- invites
CREATE POLICY inv_admin_all ON public.organization_invites FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));

-- profiles
CREATE POLICY prof_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR (org_id = public.current_org_id() AND public.is_org_admin(auth.uid())) OR public.is_platform_owner(auth.uid()));
CREATE POLICY prof_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY prof_update_admin ON public.profiles FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));

-- documents
CREATE POLICY doc_select ON public.documents FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY doc_insert ON public.documents FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND user_id = auth.uid());
CREATE POLICY doc_update ON public.documents FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND (user_id = auth.uid() OR public.is_org_admin(auth.uid())))
  WITH CHECK (org_id = public.current_org_id());
CREATE POLICY doc_delete ON public.documents FOR DELETE TO authenticated
  USING (org_id = public.current_org_id() AND (user_id = auth.uid() OR public.is_org_admin(auth.uid())));

-- units / categories
CREATE POLICY unit_select ON public.units FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY unit_admin ON public.units FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));
CREATE POLICY cat_select ON public.categories FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY cat_admin ON public.categories FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));

-- audit logs (read only from client)
CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND (user_id = auth.uid() OR public.is_org_admin(auth.uid())));

-- backups
CREATE POLICY bs_admin ON public.backup_settings FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));
CREATE POLICY bf_admin ON public.backup_files FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));

-- retention
CREATE POLICY rp_select ON public.retention_policies FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY rp_admin ON public.retention_policies FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));

-- certificates: owner only
CREATE POLICY cert_own ON public.user_certificates FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND org_id = public.current_org_id());

-- dpo
CREATE POLICY dpo_select ON public.dpo_config FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY dpo_admin ON public.dpo_config FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));

-- consents / data requests / incidents
CREATE POLICY cons_select ON public.consents FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (org_id = public.current_org_id() AND public.is_org_admin(auth.uid())));
CREATE POLICY dr_select ON public.data_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (org_id = public.current_org_id() AND public.is_org_admin(auth.uid())));
CREATE POLICY dr_admin_update ON public.data_requests FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));
CREATE POLICY pi_select ON public.privacy_incidents FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));
CREATE POLICY pi_admin ON public.privacy_incidents FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()))
  WITH CHECK (org_id = public.current_org_id() AND public.is_org_admin(auth.uid()));

-- license_config / system_updates: platform owners only
CREATE POLICY lc_owner ON public.license_config FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));
CREATE POLICY su_select ON public.system_updates FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()));

-- ============ 6. org-aware helpers ============
CREATE OR REPLACE FUNCTION public.get_my_org()
RETURNS TABLE(id uuid, name text, slug text, plan text, status text, trial_ends_at timestamptz, storage_limit_gb numeric, storage_used_bytes bigint, max_users integer, drive_configured boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug, o.plan, o.status, o.trial_ends_at, o.storage_limit_gb,
         o.storage_used_bytes, o.max_users, COALESCE(d.configured, false)
    FROM public.organizations o
    LEFT JOIN public.organization_drive_config d ON d.org_id = o.id
   WHERE o.id = public.current_org_id()
$$;
REVOKE ALL ON FUNCTION public.get_my_org() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_org() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER org_drive_updated_at BEFORE UPDATE ON public.organization_drive_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();