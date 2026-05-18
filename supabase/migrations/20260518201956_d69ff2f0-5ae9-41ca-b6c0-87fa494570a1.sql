
-- Helper function to get user's unit without RLS recursion
CREATE OR REPLACE FUNCTION public.get_user_unit(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unit FROM public.profiles WHERE id = _user_id AND active = true
$$;

-- Replace SELECT policy on documents
DROP POLICY IF EXISTS "Users read own or admin reads all documents" ON public.documents;

CREATE POLICY "Users read own unit or admin reads all documents"
ON public.documents
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'Administrador')
  OR auth.uid() = user_id
  OR (
    unit IS NOT NULL
    AND unit <> ''
    AND unit = public.get_user_unit(auth.uid())
  )
);
