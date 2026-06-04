ALTER TABLE public.user_certificates
  DROP CONSTRAINT IF EXISTS signature_logo_data_url_only;
ALTER TABLE public.user_certificates
  ADD CONSTRAINT signature_logo_data_url_only
  CHECK (signature_logo IS NULL OR signature_logo LIKE 'data:image/%');