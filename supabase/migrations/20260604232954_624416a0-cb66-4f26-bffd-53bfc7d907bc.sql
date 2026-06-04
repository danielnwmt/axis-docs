
-- Revoke EXECUTE from authenticated/PUBLIC on SECURITY DEFINER functions
-- not directly called from the client.
REVOKE EXECUTE ON FUNCTION public.anonymize_user(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_incident(uuid, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_incident_subjects(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.report_incident_anpd(uuid, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_data_action(text, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_data_export() FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.log_pii_access(text, text, uuid, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_unit(uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM authenticated, anon, PUBLIC;

-- Keep service_role able to call them
GRANT EXECUTE ON FUNCTION public.anonymize_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_incident(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_incident_subjects(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_incident_anpd(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_data_action(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_data_export() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_pii_access(text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_unit(uuid) TO service_role;
