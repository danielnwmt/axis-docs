
-- ============ CONSENTIMENTOS ============
CREATE TABLE public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('privacy_policy','terms_of_use','cookies')),
  version text NOT NULL,
  ip text,
  user_agent text,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_consents_user ON public.consents(user_id, document_type, accepted_at DESC);
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own or admin reads all consents"
  ON public.consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Users insert own consents"
  ON public.consents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Block updates on consents"
  ON public.consents AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Block deletes on consents"
  ON public.consents AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- ============ SOLICITAÇÕES DO TITULAR ============
CREATE TABLE public.data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('export','delete','rectify','revoke_consent','access_history')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','rejected')),
  payload jsonb,
  notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid
);
CREATE INDEX idx_data_requests_user ON public.data_requests(user_id, requested_at DESC);
CREATE INDEX idx_data_requests_status ON public.data_requests(status, requested_at DESC);
ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own or admin reads all data requests"
  ON public.data_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Users insert own data requests"
  ON public.data_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins update data requests"
  ON public.data_requests FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'))
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Block deletes on data requests"
  ON public.data_requests AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (false);

-- ============ POLÍTICAS DE RETENÇÃO ============
CREATE TABLE public.retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL UNIQUE,
  retention_days integer NOT NULL CHECK (retention_days > 0),
  action text NOT NULL DEFAULT 'anonymize' CHECK (action IN ('anonymize','delete')),
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read retention policies"
  ON public.retention_policies FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage retention policies insert"
  ON public.retention_policies FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins manage retention policies update"
  ON public.retention_policies FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins manage retention policies delete"
  ON public.retention_policies FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

-- ============ INCIDENTES DE PRIVACIDADE ============
CREATE TABLE public.privacy_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  affected_users_count integer NOT NULL DEFAULT 0,
  reported_to_anpd_at timestamptz,
  anpd_protocol text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.privacy_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read incidents"
  ON public.privacy_incidents FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins insert incidents"
  ON public.privacy_incidents FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'Administrador') AND created_by = auth.uid());

CREATE POLICY "Admins update incidents"
  ON public.privacy_incidents FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

-- ============ DPO CONFIG (singleton) ============
CREATE TABLE public.dpo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  privacy_policy_version text NOT NULL DEFAULT '1.0',
  terms_version text NOT NULL DEFAULT '1.0',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.dpo_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read dpo config"
  ON public.dpo_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins insert dpo config"
  ON public.dpo_config FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins update dpo config"
  ON public.dpo_config FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

INSERT INTO public.dpo_config (name, email, phone) VALUES ('A definir', 'dpo@empresa.com.br', '(00) 0000-0000');

INSERT INTO public.retention_policies (category, retention_days, action) VALUES
  ('Contrato', 1825, 'anonymize'),
  ('Recibo', 1825, 'anonymize'),
  ('Outros', 365, 'anonymize');

-- ============ FUNÇÕES ============
CREATE OR REPLACE FUNCTION public.record_consent(_document_type text, _version text, _ip text DEFAULT NULL, _user_agent text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _document_type NOT IN ('privacy_policy','terms_of_use','cookies') THEN
    RAISE EXCEPTION 'Invalid document_type';
  END IF;
  INSERT INTO public.consents (user_id, document_type, version, ip, user_agent)
  VALUES (_user_id, _document_type, _version, _ip, _user_agent)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_data_action(_type text, _notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _user_email text;
  _id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _type NOT IN ('export','delete','rectify','revoke_consent','access_history') THEN
    RAISE EXCEPTION 'Invalid request type';
  END IF;
  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;
  INSERT INTO public.data_requests (user_id, user_email, type, notes)
  VALUES (_user_id, COALESCE(_user_email,''), _type, _notes)
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_user_id, COALESCE(_user_email,''), 'Solicitação LGPD: ' || _type, 'other', _type, _notes);

  RETURN _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.anonymize_user(_target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash text := substr(md5(_target::text || now()::text), 1, 12);
BEGIN
  IF NOT has_role(auth.uid(), 'Administrador') THEN
    RAISE EXCEPTION 'Admin required';
  END IF;
  UPDATE public.profiles
     SET email = 'anon_' || _hash || '@anonymized.local',
         active = false
   WHERE id = _target;
  UPDATE public.audit_logs
     SET user_email = 'anon_' || _hash
   WHERE user_id = _target;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (auth.uid(), '', 'Anonimização LGPD', 'edit', _target::text, 'Usuário anonimizado conforme Art. 16 LGPD');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_data_export()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _result jsonb;
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
END;
$$;
