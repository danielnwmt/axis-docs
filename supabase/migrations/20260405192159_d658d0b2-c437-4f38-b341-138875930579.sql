ALTER TABLE public.profiles ADD COLUMN must_change_password boolean NOT NULL DEFAULT true;

-- Set existing admin to require password change
UPDATE public.profiles SET must_change_password = true WHERE email = 'admin@axis.com';