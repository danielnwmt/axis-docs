REVOKE EXECUTE ON FUNCTION public.get_license_status_public() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_license_status_public() TO authenticated;