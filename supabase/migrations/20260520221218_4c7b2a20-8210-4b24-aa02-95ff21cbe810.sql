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
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own certificate metadata"
  ON public.user_certificates FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Users insert own certificate"
  ON public.user_certificates FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own certificate"
  ON public.user_certificates FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own certificate"
  ON public.user_certificates FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_certificates_user_id ON public.user_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_certificates_valid_to ON public.user_certificates(valid_to);