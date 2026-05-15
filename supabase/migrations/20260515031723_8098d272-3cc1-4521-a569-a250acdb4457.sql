-- Allow admins to delete any document
CREATE POLICY "Admins can delete any document"
  ON public.documents
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

-- Replace INSERT policy to also enforce file_path ownership
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;

CREATE POLICY "Users insert own documents with owned path"
  ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      file_path = ''
      OR file_path LIKE auth.uid()::text || '/%'
      OR file_path LIKE auth.uid()::text || '\_%' ESCAPE '\'
      OR file_path = auth.uid()::text
    )
  );