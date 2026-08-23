ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS doc_type text NOT NULL DEFAULT 'CNPJ',
  ADD COLUMN IF NOT EXISTS document text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS notes text;