-- SETTINGS: escopo por organização
DROP POLICY IF EXISTS "Admins can read settings files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload settings files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update settings files" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete settings files" ON storage.objects;

CREATE POLICY "Org admins read own org settings"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'settings'
  AND public.is_org_admin(auth.uid())
  AND (storage.foldername(name))[1] = 'orgs'
  AND (storage.foldername(name))[2] = public.current_org_id()::text
);

CREATE POLICY "Org admins write own org settings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'settings'
  AND public.is_org_admin(auth.uid())
  AND (storage.foldername(name))[1] = 'orgs'
  AND (storage.foldername(name))[2] = public.current_org_id()::text
);

CREATE POLICY "Org admins update own org settings"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'settings'
  AND public.is_org_admin(auth.uid())
  AND (storage.foldername(name))[1] = 'orgs'
  AND (storage.foldername(name))[2] = public.current_org_id()::text
)
WITH CHECK (
  bucket_id = 'settings'
  AND public.is_org_admin(auth.uid())
  AND (storage.foldername(name))[1] = 'orgs'
  AND (storage.foldername(name))[2] = public.current_org_id()::text
);

CREATE POLICY "Org admins delete own org settings"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'settings'
  AND public.is_org_admin(auth.uid())
  AND (storage.foldername(name))[1] = 'orgs'
  AND (storage.foldername(name))[2] = public.current_org_id()::text
);

-- DOCUMENTS: admin só dentro da própria organização
DROP POLICY IF EXISTS "Users can read own document files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own document files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own document files" ON storage.objects;

CREATE POLICY "Org members read document files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.file_path = storage.objects.name
      AND d.org_id = public.current_org_id()
      AND (d.user_id = auth.uid() OR public.is_org_admin(auth.uid()))
  )
);

CREATE POLICY "Org members update document files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.file_path = storage.objects.name
      AND d.org_id = public.current_org_id()
      AND (d.user_id = auth.uid() OR public.is_org_admin(auth.uid()))
  )
);

CREATE POLICY "Org members delete document files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.file_path = storage.objects.name
      AND d.org_id = public.current_org_id()
      AND (d.user_id = auth.uid() OR public.is_org_admin(auth.uid()))
  )
);