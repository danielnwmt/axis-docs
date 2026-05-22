ALTER TABLE public.user_certificates
  ADD COLUMN IF NOT EXISTS signature_logo text,
  ADD COLUMN IF NOT EXISTS signature_logo_size_pct integer NOT NULL DEFAULT 22;