
ALTER TABLE public.categories ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE public.categories ADD COLUMN is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.units ADD COLUMN active boolean NOT NULL DEFAULT true;
ALTER TABLE public.units ADD COLUMN is_default boolean NOT NULL DEFAULT false;

UPDATE public.categories SET is_default = true;
UPDATE public.units SET is_default = true;
