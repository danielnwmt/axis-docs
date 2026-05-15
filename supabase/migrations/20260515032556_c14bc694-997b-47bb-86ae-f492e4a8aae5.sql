-- 1) Move pgcrypto out of public schema
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
ALTER EXTENSION pgcrypto SET SCHEMA extensions;

-- 2) Replace insert_audit_log with SECURITY INVOKER version
DROP FUNCTION IF EXISTS public.insert_audit_log(text, text, text, text);

-- Allow authenticated users to insert only their own audit rows
DROP POLICY IF EXISTS "Block direct client inserts on audit_logs" ON public.audit_logs;
CREATE POLICY "Authenticated users insert own audit logs"
  ON public.audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.insert_audit_log(
  _action text,
  _action_type text DEFAULT 'other',
  _target text DEFAULT '',
  _details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
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