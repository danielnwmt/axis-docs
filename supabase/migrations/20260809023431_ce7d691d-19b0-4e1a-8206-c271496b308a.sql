-- Fix for public.profiles update policy
DROP POLICY IF EXISTS "Users can update own profile safely" ON public.profiles;

CREATE POLICY "Users can update own profile safely" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    AND unit = (SELECT p.unit FROM profiles p WHERE p.id = auth.uid())
  );

-- Fix for trigger to also protect 'unit'
CREATE OR REPLACE FUNCTION public.prevent_profile_sensitive_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT has_role(auth.uid(), 'Administrador') THEN
      RAISE EXCEPTION 'Only administrators can change user roles';
    END IF;
  END IF;

  IF OLD.unit IS DISTINCT FROM NEW.unit THEN
    IF NOT has_role(auth.uid(), 'Administrador') THEN
      RAISE EXCEPTION 'Only administrators can change user units';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_role_change ON public.profiles;
DROP TRIGGER IF EXISTS enforce_profile_security ON public.profiles;

CREATE TRIGGER enforce_profile_security
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_sensitive_changes();