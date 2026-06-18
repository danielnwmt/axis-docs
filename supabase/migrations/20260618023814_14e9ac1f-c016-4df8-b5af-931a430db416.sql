
DROP POLICY IF EXISTS "Admins read retention policies" ON public.retention_policies;
CREATE POLICY "Authenticated users read retention policies"
ON public.retention_policies FOR SELECT
TO authenticated
USING (true);
