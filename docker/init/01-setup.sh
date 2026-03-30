#!/bin/bash
set -e

# ============================================================
# Part 1: Roles and schemas (needs password variable expansion)
# ============================================================
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<EOSQL

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;

-- Roles
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE ROLE authenticator LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT;
CREATE ROLE supabase_auth_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT CREATEROLE CREATEDB;
CREATE ROLE supabase_storage_admin LOGIN PASSWORD '${POSTGRES_PASSWORD}' NOINHERIT;

-- Role grants
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
GRANT supabase_auth_admin TO postgres;
GRANT supabase_storage_admin TO postgres;

-- Schema access
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT CREATE ON SCHEMA public TO supabase_auth_admin, supabase_storage_admin;

-- Auth schema (GoTrue will create its tables here)
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, postgres;

-- Storage schema (Storage API will create its tables here)
CREATE SCHEMA IF NOT EXISTS storage AUTHORIZATION supabase_storage_admin;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role, postgres;

EOSQL

# ============================================================
# Part 2: Tables, functions, policies (no variable expansion)
# ============================================================
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'

-- ========================================
-- Auth helper functions (needed for RLS)
-- ========================================
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'role', '')::text
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'email', '')::text
$$;

-- ========================================
-- Application tables
-- ========================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'Usuário',
  unit text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT ''
);

CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_size bigint DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  category text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT '',
  subject text DEFAULT '',
  keywords text DEFAULT '',
  notes text DEFAULT '',
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text DEFAULT '',
  ocr_status text NOT NULL DEFAULT 'pendente',
  ocr_text text DEFAULT '',
  sign_status text NOT NULL DEFAULT 'pendente'
);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL
);

CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  action_type text NOT NULL DEFAULT 'other',
  target text NOT NULL DEFAULT '',
  details text
);

-- ========================================
-- Enable RLS
-- ========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ========================================
-- Application functions
-- ========================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.insert_audit_log(
  _action text,
  _action_type text DEFAULT 'other',
  _target text DEFAULT '',
  _details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _user_email text;
BEGIN
  _user_id := auth.uid();
  _user_email := auth.email();
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_user_id, COALESCE(_user_email, ''), _action, _action_type, _target, _details);
END;
$$;

-- ========================================
-- RLS Policies: profiles
-- ========================================
CREATE POLICY "Users can read own profile or admin reads all" ON public.profiles
  FOR SELECT TO authenticated
  USING ((auth.uid() = id) OR has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Users can update own profile safely" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK ((auth.uid() = id) AND (role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())));

CREATE POLICY "Users can insert own profile with default role" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = id) AND (role = 'Usuário'));

CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'))
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

-- ========================================
-- RLS Policies: documents
-- ========================================
CREATE POLICY "Authenticated users can insert documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users read own or admin reads all documents" ON public.documents
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'Administrador'));

-- ========================================
-- RLS Policies: categories
-- ========================================
CREATE POLICY "Authenticated users can read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins can update categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins can delete categories" ON public.categories
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

-- ========================================
-- RLS Policies: units
-- ========================================
CREATE POLICY "Authenticated users can read units" ON public.units
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert units" ON public.units
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins can update units" ON public.units
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

CREATE POLICY "Admins can delete units" ON public.units
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

-- ========================================
-- RLS Policies: audit_logs
-- ========================================
CREATE POLICY "Users read own or admin reads all audit logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'Administrador'));

-- ========================================
-- Grants
-- ========================================
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

-- Default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

EOSQL

echo "✅ Database initialized successfully"
