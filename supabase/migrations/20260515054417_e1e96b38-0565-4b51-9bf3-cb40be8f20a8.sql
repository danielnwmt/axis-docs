ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'pt-BR';

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_language_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_language_check CHECK (language IN ('pt-BR','en','es'));