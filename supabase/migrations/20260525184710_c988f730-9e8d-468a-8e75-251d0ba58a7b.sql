CREATE TABLE IF NOT EXISTS public.user_certificates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pfx_encrypted bytea NOT NULL,
  pfx_iv bytea NOT NULL,
  pfx_auth_tag bytea NOT NULL,
  subject_cn text NOT NULL DEFAULT '',
  cpf text NOT NULL DEFAULT '',
  issuer text NOT NULL DEFAULT '',
  valid_from timestamp with time zone,
  valid_to timestamp with time zone,
  fingerprint_sha256 text NOT NULL DEFAULT '',
  uploaded_at timestamp with time zone NOT NULL DEFAULT now(),
  signature_logo_size_pct integer NOT NULL DEFAULT 22,
  signature_logo text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_certificates_user_id_key
  ON public.user_certificates(user_id);

ALTER TABLE public.user_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own certificate metadata" ON public.user_certificates;
CREATE POLICY "Users read own certificate metadata"
  ON public.user_certificates FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'Administrador'));

DROP POLICY IF EXISTS "Users insert own certificate" ON public.user_certificates;
CREATE POLICY "Users insert own certificate"
  ON public.user_certificates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own certificate" ON public.user_certificates;
CREATE POLICY "Users update own certificate"
  ON public.user_certificates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own certificate" ON public.user_certificates;
CREATE POLICY "Users delete own certificate"
  ON public.user_certificates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);