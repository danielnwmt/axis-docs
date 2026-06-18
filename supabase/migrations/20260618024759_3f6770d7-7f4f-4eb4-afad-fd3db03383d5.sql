
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.anonymize_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_unit(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.notify_incident_subjects(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.request_data_action(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_data_export() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.resolve_incident(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_consent(text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_active_user(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.report_incident_anpd(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.log_pii_access(text, text, uuid, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_unit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_incident_subjects(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_data_action(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_data_export() TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_incident(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_consent(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_incident_anpd(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_pii_access(text, text, uuid, text) TO authenticated;
