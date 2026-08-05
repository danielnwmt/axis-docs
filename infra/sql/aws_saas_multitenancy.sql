-- AxisDocs SaaS / AWS foundation
-- Executar MANUALMENTE no banco do ambiente AWS (não é migration automática do Lovable Cloud).
-- Ordem obrigatória: CREATE TABLE -> GRANT -> ENABLE RLS -> POLICIES.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- tenants

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  document text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
  plan_name text NOT NULL DEFAULT 'Prefeitura 2 TB',
  storage_limit_bytes bigint NOT NULL DEFAULT 2199023255552,
  storage_used_bytes bigint NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  max_users integer NOT NULL DEFAULT 20 CHECK (max_users > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;

-- ---------------------------------------------------------------- colunas de tenant

ALTER TABLE public.profiles   ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.profiles   ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;
ALTER TABLE public.documents  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.documents  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'legacy';
ALTER TABLE public.documents  ADD COLUMN IF NOT EXISTS s3_bucket text;
ALTER TABLE public.documents  ADD COLUMN IF NOT EXISTS s3_object_key text;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.units      ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

DO $$ BEGIN
  ALTER TABLE public.documents
    ADD CONSTRAINT documents_storage_provider_check
    CHECK (storage_provider IN ('legacy','google_drive','s3'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_id  ON public.profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON public.documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_tenant   ON public.categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_units_tenant        ON public.units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant   ON public.audit_logs(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_s3_key
  ON public.documents(s3_object_key) WHERE s3_object_key IS NOT NULL;

-- ---------------------------------------------------------------- funções

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND active = true
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid() AND active = true), false)
$$;

REVOKE ALL ON FUNCTION public.current_tenant_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- Contabilidade de cota: só o backend (service_role) pode chamar.
CREATE OR REPLACE FUNCTION public.confirm_tenant_storage_upload(_tenant_id uuid, _bytes bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tenants
     SET storage_used_bytes = storage_used_bytes + GREATEST(_bytes, 0),
         updated_at = now()
   WHERE id = _tenant_id
     AND storage_used_bytes + GREATEST(_bytes, 0) <= storage_limit_bytes;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Limite de armazenamento atingido';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.release_tenant_storage(_tenant_id uuid, _bytes bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.tenants
     SET storage_used_bytes = GREATEST(0, storage_used_bytes - GREATEST(_bytes, 0)),
         updated_at = now()
   WHERE id = _tenant_id
$$;

REVOKE ALL ON FUNCTION public.confirm_tenant_storage_upload(uuid, bigint) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.release_tenant_storage(uuid, bigint) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_tenant_storage_upload(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_tenant_storage(uuid, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.set_row_tenant()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.current_tenant_id();
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------- RLS

ALTER TABLE public.tenants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas antigas são combinadas com OR e anulariam o isolamento por tenant.
DO $$
DECLARE tbl text; p record;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['tenants','documents','categories','units','audit_logs'] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, tbl);
    END LOOP;
  END LOOP;
END $$;

CREATE POLICY tenants_select_policy ON public.tenants FOR SELECT TO authenticated
  USING (id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY tenants_super_admin_all ON public.tenants FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY documents_tenant_select ON public.documents FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY documents_tenant_insert ON public.documents FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id() AND user_id = auth.uid());
CREATE POLICY documents_tenant_update ON public.documents FOR UPDATE TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY documents_tenant_delete ON public.documents FOR DELETE TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY categories_tenant_all ON public.categories FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY units_tenant_all ON public.units FOR ALL TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin())
  WITH CHECK (tenant_id = public.current_tenant_id() OR public.is_super_admin());

CREATE POLICY audit_tenant_select ON public.audit_logs FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id() OR public.is_super_admin());
CREATE POLICY audit_tenant_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units      TO authenticated;
GRANT SELECT, INSERT                 ON public.audit_logs TO authenticated;
GRANT ALL ON public.documents, public.categories, public.units, public.audit_logs TO service_role;

-- ---------------------------------------------------------------- triggers

DROP TRIGGER IF EXISTS trg_documents_tenant  ON public.documents;
DROP TRIGGER IF EXISTS trg_set_document_tenant ON public.documents;
DROP TRIGGER IF EXISTS trg_categories_tenant ON public.categories;
DROP TRIGGER IF EXISTS trg_units_tenant      ON public.units;
DROP TRIGGER IF EXISTS trg_audit_tenant      ON public.audit_logs;

CREATE TRIGGER trg_documents_tenant  BEFORE INSERT ON public.documents  FOR EACH ROW EXECUTE FUNCTION public.set_row_tenant();
CREATE TRIGGER trg_categories_tenant BEFORE INSERT ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_row_tenant();
CREATE TRIGGER trg_units_tenant      BEFORE INSERT ON public.units      FOR EACH ROW EXECUTE FUNCTION public.set_row_tenant();
CREATE TRIGGER trg_audit_tenant      BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.set_row_tenant();

COMMIT;
