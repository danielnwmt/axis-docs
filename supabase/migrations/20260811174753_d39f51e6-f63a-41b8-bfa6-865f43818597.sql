DROP POLICY IF EXISTS "Avatars are viewable by authenticated users" ON storage.objects;
CREATE POLICY "Users can read own avatar" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'Administrador')
    )
  );

REVOKE ALL ON FUNCTION public.prevent_profile_sensitive_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.anonymize_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_incident_subjects(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.report_incident_anpd(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_incident(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_pii_access(text, text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_unit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_data_export() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_consent(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_data_action(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insert_audit_log(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_license_status_public() FROM PUBLIC, anon;