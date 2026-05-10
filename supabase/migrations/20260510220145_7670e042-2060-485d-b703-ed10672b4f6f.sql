CREATE TABLE IF NOT EXISTS public.license_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_url text NOT NULL DEFAULT '',
  license_key text NOT NULL DEFAULT '',
  hardware_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'inactive',
  customer_name text DEFAULT '',
  expires_at timestamptz,
  message text DEFAULT '',
  last_check timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.license_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read license config" ON public.license_config
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins insert license config" ON public.license_config
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins update license config" ON public.license_config
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));