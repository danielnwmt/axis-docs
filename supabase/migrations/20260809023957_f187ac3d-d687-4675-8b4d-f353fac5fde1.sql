-- 1. Restringir funções SECURITY DEFINER remanescentes
REVOKE EXECUTE ON FUNCTION public.get_user_unit(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_active_user(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_sensitive_changes() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) FROM public, anon, authenticated;

-- 2. Garantir acesso controlado
GRANT EXECUTE ON FUNCTION public.get_user_unit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_profile_sensitive_changes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_audit_log(text, text, text, text) TO authenticated, service_role;

-- 3. Limpar políticas de bypass redundantes ou perigosas
DROP POLICY IF EXISTS "Block updates on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Block deletes on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Block direct client inserts on audit_logs" ON public.audit_logs;

-- Recriar políticas de bloqueio de forma mais limpa
CREATE POLICY "Block updates on audit_logs" ON public.audit_logs FOR UPDATE TO public USING (false);
CREATE POLICY "Block deletes on audit_logs" ON public.audit_logs FOR DELETE TO public USING (false);
CREATE POLICY "Block direct client inserts on audit_logs" ON public.audit_logs FOR INSERT TO public WITH CHECK (false);

-- 4. Reforçar RLS em documentos (verificado no linter como ponto de atenção)
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
