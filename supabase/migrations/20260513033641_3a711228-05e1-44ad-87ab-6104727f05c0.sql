-- Revoke public/anon execute on internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM anon, authenticated, public;

-- insert_audit_log: only authenticated users can call
REVOKE EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) TO authenticated;

-- Explicit RESTRICTIVE deny on direct INSERT to audit_logs from clients
-- (writes only allowed via insert_audit_log SECURITY DEFINER function)
DROP POLICY IF EXISTS "Block direct client inserts on audit_logs" ON public.audit_logs;
CREATE POLICY "Block direct client inserts on audit_logs"
ON public.audit_logs
AS RESTRICTIVE
FOR INSERT
TO authenticated, anon
WITH CHECK (false);