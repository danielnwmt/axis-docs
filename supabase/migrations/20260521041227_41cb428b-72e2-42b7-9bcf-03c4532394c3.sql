
-- LGPD: integridade backup, incidentes, acesso a PII
ALTER TABLE public.backup_files
  ADD COLUMN IF NOT EXISTS sha256 text DEFAULT '',
  ADD COLUMN IF NOT EXISTS encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS encryption_algo text DEFAULT '';

ALTER TABLE public.privacy_incidents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS data_subjects_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution text DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- RPC: registrar acesso a dado pessoal de terceiros
CREATE OR REPLACE FUNCTION public.log_pii_access(
  _resource_type text,
  _resource_id text,
  _target_user_id uuid DEFAULT NULL,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  -- Não loga acesso do próprio dono
  IF _target_user_id IS NOT NULL AND _target_user_id = _uid THEN
    RETURN;
  END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (
    _uid, COALESCE(_email,''),
    'Acesso a dado pessoal (' || _resource_type || ')',
    'access',
    _resource_id,
    COALESCE(_reason, 'Visualização administrativa') ||
      CASE WHEN _target_user_id IS NOT NULL THEN ' | titular=' || _target_user_id::text ELSE '' END
  );
END;
$$;

-- RPC: marcar incidente como notificado titulares
CREATE OR REPLACE FUNCTION public.notify_incident_subjects(_incident_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _email text;
BEGIN
  IF NOT has_role(_uid, 'Administrador') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  UPDATE public.privacy_incidents
     SET data_subjects_notified_at = now(),
         updated_at = now()
   WHERE id = _incident_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_uid, COALESCE(_email,''), 'Titulares notificados sobre incidente LGPD', 'other', _incident_id::text, 'Art. 48 LGPD');
END;
$$;

-- RPC: marcar incidente notificado à ANPD
CREATE OR REPLACE FUNCTION public.report_incident_anpd(_incident_id uuid, _protocol text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _email text;
BEGIN
  IF NOT has_role(_uid, 'Administrador') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  UPDATE public.privacy_incidents
     SET reported_to_anpd_at = now(),
         anpd_protocol = _protocol,
         status = CASE WHEN status = 'open' THEN 'anpd_notified' ELSE status END,
         updated_at = now()
   WHERE id = _incident_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_uid, COALESCE(_email,''), 'Incidente reportado à ANPD', 'other', _incident_id::text, 'Protocolo: ' || COALESCE(_protocol,''));
END;
$$;

-- RPC: resolver incidente
CREATE OR REPLACE FUNCTION public.resolve_incident(_incident_id uuid, _resolution text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _email text;
BEGIN
  IF NOT has_role(_uid, 'Administrador') THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = _uid;
  UPDATE public.privacy_incidents
     SET status = 'resolved', resolution = COALESCE(_resolution,''), updated_at = now()
   WHERE id = _incident_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_uid, COALESCE(_email,''), 'Incidente LGPD resolvido', 'other', _incident_id::text, _resolution);
END;
$$;
