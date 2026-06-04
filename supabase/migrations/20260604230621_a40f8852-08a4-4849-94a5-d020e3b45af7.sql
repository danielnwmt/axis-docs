
-- Restrict sensitive license_config columns: SELECT becomes admin-only.
-- Expose a safe, public-status RPC for the gate/dashboard that omits license_key, server_url and hardware_id.

DROP POLICY IF EXISTS "Authenticated read license config" ON public.license_config;
DROP POLICY IF EXISTS "Admins read license config" ON public.license_config;
CREATE POLICY "Admins read license config"
  ON public.license_config FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

-- Safe RPC: returns non-sensitive license status fields to any authenticated user.
CREATE OR REPLACE FUNCTION public.get_license_status_public()
RETURNS TABLE (
  id uuid,
  status text,
  customer_name text,
  expires_at timestamptz,
  last_check timestamptz,
  message text,
  temp_unlock_until timestamptz,
  storage_limit_gb numeric,
  storage_used_bytes bigint,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lc.id, lc.status, lc.customer_name, lc.expires_at, lc.last_check,
         lc.message, lc.temp_unlock_until, lc.storage_limit_gb,
         lc.storage_used_bytes, lc.updated_at
    FROM public.license_config lc
    ORDER BY lc.updated_at DESC NULLS LAST
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_license_status_public() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_license_status_public() TO authenticated;

-- Restrict retention_policies SELECT to administrators only.
DROP POLICY IF EXISTS "Auth users read retention policies" ON public.retention_policies;
DROP POLICY IF EXISTS "Admins read retention policies" ON public.retention_policies;
CREATE POLICY "Admins read retention policies"
  ON public.retention_policies FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));
