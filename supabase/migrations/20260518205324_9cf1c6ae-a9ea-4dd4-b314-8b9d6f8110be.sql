DROP POLICY IF EXISTS "Users insert own documents with owned path" ON public.documents;

CREATE POLICY "Users insert own documents with owned path"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    file_path = ''
    OR file_path LIKE 'drive://%'
    OR file_path LIKE (auth.uid()::text || '/%')
    OR file_path LIKE like_escape(auth.uid()::text || '\_%', '\')
    OR file_path = auth.uid()::text
  )
);