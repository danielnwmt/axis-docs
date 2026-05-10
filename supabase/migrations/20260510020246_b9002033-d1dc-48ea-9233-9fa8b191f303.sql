
ALTER TABLE public.backup_settings 
  ADD COLUMN IF NOT EXISTS schedule_time time NOT NULL DEFAULT '02:00:00',
  ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_scheduled_run date;
