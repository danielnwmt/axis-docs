ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_name_key;
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS units_org_name_key ON public.units (org_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS categories_org_name_key ON public.categories (org_id, name);