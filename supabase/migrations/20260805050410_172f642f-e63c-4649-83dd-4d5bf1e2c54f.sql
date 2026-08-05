DROP POLICY IF EXISTS "Anyone can read settings files" ON storage.objects;
CREATE POLICY "Admins can read settings files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'settings' AND public.has_role(auth.uid(), 'Administrador'));