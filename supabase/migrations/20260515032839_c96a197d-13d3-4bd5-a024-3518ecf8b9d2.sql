-- Block direct inserts again
DROP POLICY IF EXISTS "Authenticated users insert own audit logs" ON public.audit_logs;
CREATE POLICY "Block direct client inserts on audit_logs"
  ON public.audit_logs
  AS RESTRICTIVE
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

-- Restore insert_audit_log as SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.insert_audit_log(
  _action text,
  _action_type text DEFAULT 'other',
  _target text DEFAULT '',
  _details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _user_email text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;

  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_user_id, COALESCE(_user_email, ''), _action, _action_type, _target, _details);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) TO authenticated;