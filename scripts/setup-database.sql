-- ============================================
-- AXIS DOCS - Script de criação do banco de dados
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================

-- Tabela de perfis de usuários
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  role text NOT NULL DEFAULT 'Usuário',
  must_change_password boolean NOT NULL DEFAULT true,
  unit text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT ''
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Tabela de categorias documentais
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false
);
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Tabela de unidades/setores
CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false
);
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- Tabela de documentos
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  subject text DEFAULT '',
  keywords text DEFAULT '',
  notes text DEFAULT '',
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text DEFAULT '',
  file_size bigint DEFAULT 0,
  ocr_status text NOT NULL DEFAULT 'pendente',
  ocr_text text DEFAULT '',
  sign_status text NOT NULL DEFAULT 'pendente',
  drive_file_id text,
  drive_link text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Tabela de logs de auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  action_type text NOT NULL DEFAULT 'other',
  target text NOT NULL DEFAULT '',
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- FUNÇÕES
-- ============================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT has_role(auth.uid(), 'Administrador') THEN
      RAISE EXCEPTION 'Only administrators can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_audit_log(
  _action text,
  _action_type text DEFAULT 'other',
  _target text DEFAULT '',
  _details text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _user_email text;
BEGIN
  _user_id := auth.uid();
  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_user_id, COALESCE(_user_email, ''), _action, _action_type, _target, _details);
END;
$$;

-- ============================================
-- POLÍTICAS RLS
-- ============================================

-- Profiles
CREATE POLICY "Users can read own profile or admin reads all" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id OR has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Users can insert own profile with default role" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id AND role = 'Usuário');

CREATE POLICY "Users can update own profile safely" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid()));

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'))
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

-- Categories
CREATE POLICY "Authenticated users can read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert categories" ON public.categories
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can update categories" ON public.categories
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can delete categories" ON public.categories
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'Administrador'));

-- Units
CREATE POLICY "Authenticated users can read units" ON public.units
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert units" ON public.units
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can update units" ON public.units
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Admins can delete units" ON public.units
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'Administrador'));

-- Documents
CREATE POLICY "Users read own or admin reads all documents" ON public.documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Authenticated users can insert documents" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Audit Logs
CREATE POLICY "Users read own or admin reads all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));

-- ============================================
-- STORAGE BUCKETS
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('settings', 'settings', false) ON CONFLICT DO NOTHING;

-- Storage policies for documents bucket
CREATE POLICY "Authenticated users can upload documents" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Users can read own documents" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Users can delete own documents" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'documents');

-- Storage policies for settings bucket
CREATE POLICY "Admins can manage settings" ON storage.objects
  FOR ALL TO authenticated USING (bucket_id = 'settings' AND has_role(auth.uid(), 'Administrador'));
CREATE POLICY "Authenticated can read settings" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'settings');

-- ============================================
-- DADOS PADRÃO (Categorias e Unidades)
-- ============================================

INSERT INTO public.categories (name, is_default) VALUES
  ('Processo Administrativo', true), ('Ofício', true), ('Contrato', true),
  ('Convênio', true), ('Decreto', true), ('Portaria', true),
  ('Memorando', true), ('Ata', true), ('Relatório', true),
  ('Nota Fiscal', true), ('Parecer', true), ('Certidão', true),
  ('Alvará', true), ('Licença', true), ('Requerimento', true),
  ('Despacho', true), ('Edital', true), ('Lei', true),
  ('Resolução', true), ('Circular', true);

INSERT INTO public.units (name, is_default) VALUES
  ('Gabinete', true), ('Administração', true), ('Saúde', true),
  ('Educação', true), ('Finanças', true), ('Obras', true),
  ('Jurídico', true), ('Recursos Humanos', true), ('Planejamento', true),
  ('Meio Ambiente', true), ('Assistência Social', true), ('Cultura', true),
  ('Esportes', true), ('Tecnologia da Informação', true), ('Comunicação', true),
  ('Transporte', true), ('Licitações', true), ('Controle Interno', true),
  ('Tributos', true), ('Agricultura', true);
