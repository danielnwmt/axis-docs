ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_hash_original text DEFAULT '',
  ADD COLUMN IF NOT EXISTS file_hash_signed text DEFAULT '',
  ADD COLUMN IF NOT EXISTS sign_timestamp timestamp with time zone,
  ADD COLUMN IF NOT EXISTS sign_certificate_info jsonb,
  ADD COLUMN IF NOT EXISTS sign_token text DEFAULT '';