-- Revogar acesso público/autenticado a funções SECURITY DEFINER sensíveis
-- Algumas precisam de acesso (como record_consent ou request_data_action), mas a maioria deve ser restrita
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.anonymize_user(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_incident_subjects(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_my_data_export() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_incident(uuid, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_incident_anpd(uuid, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_pii_access(text, text, uuid, text) FROM public, anon, authenticated;

-- Garantir acesso apenas ao service_role para estas funções (elas são chamadas via RPC por admins ou via Edge Functions)
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role; -- has_role é usada em RLS
GRANT EXECUTE ON FUNCTION public.anonymize_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_incident_subjects(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_data_export() TO authenticated; -- Usuário pode exportar os PRÓPRIOS dados
GRANT EXECUTE ON FUNCTION public.resolve_incident(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_incident_anpd(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_pii_access(text, text, uuid, text) TO service_role;

-- Ajustar permissões da tabela audit_logs para evitar bypass de RLS via inserção direta
-- A tabela audit_logs deve ser escrita APENAS via trigger ou função SECURITY DEFINER
REVOKE INSERT, UPDATE, DELETE ON public.audit_logs FROM authenticated, anon;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- Reforçar GRANTs nas tabelas principais para garantir que RLS seja a única barreira
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.documents TO authenticated;
GRANT SELECT ON public.license_config TO authenticated;
