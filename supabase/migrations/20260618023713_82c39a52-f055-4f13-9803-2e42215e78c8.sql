
CREATE OR REPLACE FUNCTION public.is_active_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND active = true)
$$;

DROP POLICY IF EXISTS "Users read own unit or admin reads all documents" ON public.documents;
CREATE POLICY "Users read own unit or admin reads all documents"
ON public.documents FOR SELECT
USING (
  has_role(auth.uid(), 'Administrador')
  OR (
    public.is_active_user(auth.uid())
    AND (
      auth.uid() = user_id
      OR (unit IS NOT NULL AND unit <> '' AND unit = get_user_unit(auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "Users insert own documents with owned path" ON public.documents;
CREATE POLICY "Users insert own documents with owned path"
ON public.documents FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND public.is_active_user(auth.uid())
  AND (
    file_path = ''
    OR file_path LIKE 'drive://%'
    OR file_path LIKE (auth.uid()::text || '/%')
    OR file_path LIKE like_escape(auth.uid()::text || '\_%', '\')
    OR file_path = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents"
ON public.documents FOR UPDATE
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_active_user(auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own documents" ON public.documents;
CREATE POLICY "Users can delete their own documents"
ON public.documents FOR DELETE
USING (auth.uid() = user_id AND public.is_active_user(auth.uid()));
