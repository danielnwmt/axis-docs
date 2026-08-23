CREATE TABLE public.platform_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  storage_price_cents_per_gb integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read platform settings"
ON public.platform_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Platform owners manage settings"
ON public.platform_settings FOR ALL TO authenticated
USING (public.is_platform_owner(auth.uid()))
WITH CHECK (public.is_platform_owner(auth.uid()));

GRANT INSERT, UPDATE, DELETE ON public.platform_settings TO authenticated;

CREATE TRIGGER platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_settings (id, storage_price_cents_per_gb) VALUES (true, 0);