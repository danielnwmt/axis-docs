ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS org_key text;

CREATE OR REPLACE FUNCTION public.generate_org_key()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'AXIS-' || upper(
    substr(md5(random()::text || clock_timestamp()::text),1,4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text),5,4) || '-' ||
    substr(md5(random()::text || clock_timestamp()::text),9,4)
  )
$$;

UPDATE public.organizations SET org_key = public.generate_org_key() WHERE org_key IS NULL;

ALTER TABLE public.organizations ALTER COLUMN org_key SET DEFAULT public.generate_org_key();

CREATE UNIQUE INDEX IF NOT EXISTS organizations_org_key_idx ON public.organizations (org_key);

CREATE OR REPLACE FUNCTION public.regenerate_org_key(_org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _new text;
BEGIN
  IF NOT public.is_platform_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Platform owner required';
  END IF;
  _new := public.generate_org_key();
  UPDATE public.organizations SET org_key = _new WHERE id = _org_id;
  RETURN _new;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_org_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regenerate_org_key(uuid) TO authenticated;