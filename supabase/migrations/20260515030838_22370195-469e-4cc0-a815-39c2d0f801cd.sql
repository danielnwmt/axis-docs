ALTER TABLE public.license_config
  ADD COLUMN IF NOT EXISTS storage_limit_gb numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_used_bytes bigint NOT NULL DEFAULT 0;