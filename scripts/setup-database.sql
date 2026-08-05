-- ============================================
-- AXIS DOCS - Script de criação do banco de dados
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================

-- Tabela de perfis de usuários
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  role text NOT NULL DEFAULT 'Usuário',
  must_change_password boolean NOT NULL DEFAULT true,
  unit text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  cpf text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT ''
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabela de categorias documentais
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false
);
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Tabela de unidades/setores
CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false
);
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Tabela de documentos
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  subject text DEFAULT '',
  keywords text DEFAULT '',
  notes text DEFAULT '',
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text DEFAULT '',
  file_size bigint DEFAULT 0,
  ocr_status text NOT NULL DEFAULT 'pendente',
  ocr_text text DEFAULT '',
  sign_status text NOT NULL DEFAULT 'pendente',
  drive_file_id text,
  drive_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Tabela de logs de auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  action_type text NOT NULL DEFAULT 'other',
  target text NOT NULL DEFAULT '',
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FUNÇÕES
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT has_role(auth.uid(), 'Administrador') THEN
      RAISE EXCEPTION 'Only administrators can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_audit_log(
  _action text,
  _action_type text DEFAULT 'other',
  _target text DEFAULT '',
  _details text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _user_email text;
BEGIN
  _user_id := auth.uid();
  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_user_id, COALESCE(_user_email, ''), _action, _action_type, _target, _details);
END;
$$;

-- ============================================
-- POLÍTICAS RLS
-- ============================================

-- Profiles
CREATE POLICY "Users can read own profile or admin reads all" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id OR has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Users can insert own profile with default role" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id AND role = 'Usuário');

CREATE POLICY "Users can update own profile safely" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'))
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

-- Categories
CREATE POLICY "Authenticated users can read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert categories" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can update categories" ON public.categories
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can delete categories" ON public.categories
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'Administrador'));

-- Units
CREATE POLICY "Authenticated users can read units" ON public.units
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert units" ON public.units
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can update units" ON public.units
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can delete units" ON public.units
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'Administrador'));

-- Documents
CREATE POLICY "Users read own or admin reads all documents" ON public.documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Authenticated users can insert documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Audit Logs
CREATE POLICY "Users read own or admin reads all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));

-- ============================================
-- STORAGE BUCKETS
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('settings', 'settings', false) ON CONFLICT DO NOTHING;

-- Storage policies for documents bucket
CREATE POLICY "Authenticated users can upload documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Users can read own documents" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Users can delete own documents" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documents');

-- Storage policies for settings bucket
CREATE POLICY "Admins can manage settings" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'settings' AND has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can read settings" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'settings' AND has_role(auth.uid(), 'Administrador'));

-- ============================================
-- DADOS PADRÃO (Categorias e Unidades)
-- ============================================

INSERT INTO public.categories (name, is_default, active)
SELECT v.name, true, true
FROM (VALUES
  ('Processo Administrativo'), ('Ofício'), ('Contrato'), ('Convênio'), ('Decreto'), ('Portaria'),
  ('Memorando'), ('Ata'), ('Relatório'), ('Nota Fiscal'), ('Parecer'), ('Certidão'),
  ('Alvará'), ('Licença'), ('Requerimento'), ('Despacho'), ('Edital'), ('Lei'),
  ('Resolução'), ('Circular')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE lower(c.name) = lower(v.name));

INSERT INTO public.units (name, is_default, active)
SELECT v.name, true, true
FROM (VALUES
  ('Gabinete'), ('Administração'), ('Saúde'), ('Educação'), ('Finanças'), ('Obras'),
  ('Jurídico'), ('Recursos Humanos'), ('Planejamento'), ('Meio Ambiente'), ('Assistência Social'),
  ('Cultura'), ('Esportes'), ('Tecnologia da Informação'), ('Comunicação'), ('Transporte'),
  ('Licitações'), ('Controle Interno'), ('Tributos'), ('Agricultura')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.units u WHERE lower(u.name) = lower(v.name));

-- ============================================
-- LICENÇA (license_config)
-- ============================================

CREATE TABLE IF NOT EXISTS public.license_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_url text NOT NULL DEFAULT '',
  license_key text NOT NULL DEFAULT '',
  hardware_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'inactive',
  customer_name text DEFAULT '',
  expires_at timestamptz,
  message text DEFAULT '',
  last_check timestamptz,
  temp_unlock_until timestamptz,
  last_temp_unlock_at timestamptz,
  storage_limit_gb numeric NOT NULL DEFAULT 0,
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS server_url text NOT NULL DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS license_key text NOT NULL DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS hardware_id text NOT NULL DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'inactive';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS message text DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS last_check timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS temp_unlock_until timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS last_temp_unlock_at timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS storage_limit_gb numeric NOT NULL DEFAULT 0;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS storage_used_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS updated_by uuid;

ALTER TABLE public.license_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read license config" ON public.license_config;
DROP POLICY IF EXISTS "Admins insert license config" ON public.license_config;
DROP POLICY IF EXISTS "Admins update license config" ON public.license_config;

CREATE POLICY "Admins read license config" ON public.license_config
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins insert license config" ON public.license_config
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins update license config" ON public.license_config
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));

-- =====================================================
-- LGPD: consents, data_requests, privacy_incidents
-- =====================================================

CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_type text NOT NULL,
  version text NOT NULL,
  ip text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own or admin reads all consents" ON public.consents;
DROP POLICY IF EXISTS "Users insert own consents" ON public.consents;
DROP POLICY IF EXISTS "Block updates on consents" ON public.consents;
DROP POLICY IF EXISTS "Block deletes on consents" ON public.consents;
CREATE POLICY "Users read own or admin reads all consents" ON public.consents
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Users insert own consents" ON public.consents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Block updates on consents" ON public.consents AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Block deletes on consents" ON public.consents AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (false);

CREATE TABLE IF NOT EXISTS public.data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb,
  notes text,
  processed_by uuid,
  processed_at timestamptz,
  requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own or admin reads all data requests" ON public.data_requests;
DROP POLICY IF EXISTS "Users insert own data requests" ON public.data_requests;
DROP POLICY IF EXISTS "Admins update data requests" ON public.data_requests;
DROP POLICY IF EXISTS "Block deletes on data requests" ON public.data_requests;
CREATE POLICY "Users read own or admin reads all data requests" ON public.data_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Users insert own data requests" ON public.data_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins update data requests" ON public.data_requests
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'))
  WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Block deletes on data requests" ON public.data_requests AS RESTRICTIVE
  FOR DELETE TO anon, authenticated USING (false);

CREATE TABLE IF NOT EXISTS public.privacy_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  affected_users_count integer NOT NULL DEFAULT 0,
  reported_to_anpd_at timestamptz,
  anpd_protocol text,
  data_subjects_notified_at timestamptz,
  resolution text DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.privacy_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read incidents" ON public.privacy_incidents;
DROP POLICY IF EXISTS "Admins insert incidents" ON public.privacy_incidents;
DROP POLICY IF EXISTS "Admins update incidents" ON public.privacy_incidents;
CREATE POLICY "Admins read incidents" ON public.privacy_incidents
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins insert incidents" ON public.privacy_incidents
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador') AND created_by = auth.uid());
CREATE POLICY "Admins update incidents" ON public.privacy_incidents
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));

-- LGPD functions
CREATE OR REPLACE FUNCTION public.record_consent(_document_type text, _version text, _ip text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid := auth.uid(); _id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _document_type NOT IN ('privacy_policy','terms_of_use','cookies') THEN RAISE EXCEPTION 'Invalid document_type'; END IF;
  INSERT INTO public.consents (user_id, document_type, version, ip, user_agent)
  VALUES (_user_id, _document_type, _version, _ip, _user_agent) RETURNING id INTO _id;
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.request_data_action(_type text, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid := auth.uid(); _user_email text; _id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _type NOT IN ('export','delete','rectify','revoke_consent','access_history') THEN RAISE EXCEPTION 'Invalid request type'; END IF;
  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;
  INSERT INTO public.data_requests (user_id, user_email, type, notes)
  VALUES (_user_id, COALESCE(_user_email,''), _type, _notes) RETURNING id INTO _id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_user_id, COALESCE(_user_email,''), 'Solicitação LGPD: ' || _type, 'other', _type, _notes);
  RETURN _id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_data_export()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _user_id uuid := auth.uid(); _result jsonb;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = _user_id),
    'documents', (SELECT COALESCE(jsonb_agg(to_jsonb(d)),'[]'::jsonb) FROM public.documents d WHERE d.user_id = _user_id),
    'consents', (SELECT COALESCE(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM public.consents c WHERE c.user_id = _user_id),
    'audit_logs', (SELECT COALESCE(jsonb_agg(to_jsonb(a)),'[]'::jsonb) FROM public.audit_logs a WHERE a.user_id = _user_id),
    'data_requests', (SELECT COALESCE(jsonb_agg(to_jsonb(r)),'[]'::jsonb) FROM public.data_requests r WHERE r.user_id = _user_id),
    'exported_at', now()
  ) INTO _result;
  RETURN _result;
END; $$;

CREATE OR REPLACE FUNCTION public.anonymize_user(_target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _hash text := substr(md5(_target::text || now()::text), 1, 12);
BEGIN
  IF NOT has_role(auth.uid(), 'Administrador') THEN RAISE EXCEPTION 'Admin required'; END IF;
  UPDATE public.profiles SET email = 'anon_' || _hash || '@anonymized.local', active = false WHERE id = _target;
  UPDATE public.audit_logs SET user_email = 'anon_' || _hash WHERE user_id = _target;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (auth.uid(), '', 'Anonimização LGPD', 'edit', _target::text, 'Usuário anonimizado conforme Art. 16 LGPD');
END; $$;

CREATE OR REPLACE FUNCTION public.log_pii_access(_resource_type text, _resource_id text, _target_user_id uuid DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF _target_user_id IS NOT NULL AND _target_user_id = _uid THEN RETURN; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_uid, COALESCE(_email,''), 'Acesso a dado pessoal (' || _resource_type || ')', 'access', _resource_id,
    COALESCE(_reason, 'Visualização administrativa') ||
      CASE WHEN _target_user_id IS NOT NULL THEN ' | titular=' || _target_user_id::text ELSE '' END);
END; $$;

CREATE OR REPLACE FUNCTION public.report_incident_anpd(_incident_id uuid, _protocol text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text;
BEGIN
  IF NOT has_role(_uid, 'Administrador') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  UPDATE public.privacy_incidents SET reported_to_anpd_at = now(), anpd_protocol = _protocol,
    status = CASE WHEN status = 'open' THEN 'anpd_notified' ELSE status END, updated_at = now()
   WHERE id = _incident_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_uid, COALESCE(_email,''), 'Incidente reportado à ANPD', 'other', _incident_id::text, 'Protocolo: ' || COALESCE(_protocol,''));
END; $$;

CREATE OR REPLACE FUNCTION public.resolve_incident(_incident_id uuid, _resolution text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text;
BEGIN
  IF NOT has_role(_uid, 'Administrador') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  UPDATE public.privacy_incidents SET status = 'resolved', resolution = COALESCE(_resolution,''), updated_at = now() WHERE id = _incident_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_uid, COALESCE(_email,''), 'Incidente LGPD resolvido', 'other', _incident_id::text, _resolution);
END; $$;

CREATE OR REPLACE FUNCTION public.notify_incident_subjects(_incident_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text;
BEGIN
  IF NOT has_role(_uid, 'Administrador') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  UPDATE public.privacy_incidents SET data_subjects_notified_at = now(), updated_at = now() WHERE id = _incident_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_uid, COALESCE(_email,''), 'Titulares notificados sobre incidente LGPD', 'other', _incident_id::text, 'Art. 48 LGPD');
END; $$;

-- =========================================================================
-- USER CERTIFICATES (ICP-Brasil A1 .pfx criptografado)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.user_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  pfx_encrypted bytea NOT NULL,
  pfx_iv bytea NOT NULL,
  pfx_auth_tag bytea NOT NULL,
  subject_cn text NOT NULL DEFAULT '',
  cpf text NOT NULL DEFAULT '',
  issuer text NOT NULL DEFAULT '',
  valid_from timestamptz,
  valid_to timestamptz,
  fingerprint_sha256 text NOT NULL DEFAULT '',
  signature_logo text,
  signature_logo_size_pct integer NOT NULL DEFAULT 22,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own certificate metadata" ON public.user_certificates;
CREATE POLICY "Users read own certificate metadata" ON public.user_certificates
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));

DROP POLICY IF EXISTS "Users insert own certificate" ON public.user_certificates;
CREATE POLICY "Users insert own certificate" ON public.user_certificates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own certificate" ON public.user_certificates;
CREATE POLICY "Users update own certificate" ON public.user_certificates
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own certificate" ON public.user_certificates;
CREATE POLICY "Users delete own certificate" ON public.user_certificates
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
