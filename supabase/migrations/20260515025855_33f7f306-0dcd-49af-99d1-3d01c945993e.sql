-- Harden audit_logs: explicit RESTRICTIVE policies blocking UPDATE/DELETE
CREATE POLICY "Block updates on audit_logs"
  ON public.audit_logs AS RESTRICTIVE
  FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Block deletes on audit_logs"
  ON public.audit_logs AS RESTRICTIVE
  FOR DELETE TO anon, authenticated
  USING (false);

-- Revoke public EXECUTE on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) TO authenticated;