
-- Backup settings (singleton row)
CREATE TABLE public.backup_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retention_days integer NOT NULL DEFAULT 5,
  drive_folder_id text,
  auto_cleanup boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read backup settings" ON public.backup_settings
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins insert backup settings" ON public.backup_settings
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins update backup settings" ON public.backup_settings
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));

-- Track each backup file uploaded to Drive
CREATE TABLE public.backup_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_file_id text NOT NULL,
  drive_link text,
  file_name text NOT NULL,
  file_size bigint DEFAULT 0,
  retention_days integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read backup files" ON public.backup_files
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins insert backup files" ON public.backup_files
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins update backup files" ON public.backup_files
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins delete backup files" ON public.backup_files
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'Administrador'));

CREATE INDEX idx_backup_files_expires ON public.backup_files (expires_at) WHERE deleted_at IS NULL;

-- Seed default singleton
INSERT INTO public.backup_settings (retention_days, auto_cleanup) VALUES (5, true);
