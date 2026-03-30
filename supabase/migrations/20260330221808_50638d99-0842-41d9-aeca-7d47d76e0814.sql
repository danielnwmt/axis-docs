
-- Trigger to prevent non-admin users from changing their own role
CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If role is being changed, only allow if the current user is an admin
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT has_role(auth.uid(), 'Administrador') THEN
      RAISE EXCEPTION 'Only administrators can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_change();
