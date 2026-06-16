CREATE TABLE public.system_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','success','failed')),
  version text NOT NULL DEFAULT 'v1.0.0',
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  message text
);

GRANT SELECT, INSERT, UPDATE ON public.system_updates TO authenticated;
GRANT ALL ON public.system_updates TO service_role;

ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view system updates"
  ON public.system_updates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins can create system updates"
  ON public.system_updates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'Administrador') AND requested_by = auth.uid());

CREATE POLICY "Service role can update system updates"
  ON public.system_updates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'Administrador'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.system_updates;
ALTER TABLE public.system_updates REPLICA IDENTITY FULL;