#!/bin/bash

# Versões dos componentes
POSTGREST_VERSION="12.2.3"
GOTRUE_VERSION="2.164.0"
STORAGE_VERSION="1.11.1"

PG_DB="axisdocs"
PG_USER="axisdocs"
PG_PASS=""
JWT_SECRET=""
ANON_KEY=""
SERVICE_KEY=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""

print_header() {
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║   AXIS DOCS - Instalação Ubuntu          ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
}

log() {
  echo "➡️  $1"
}

success() {
  echo "✅ $1"
}

fail() {
  echo "❌ $1"
  exit 1
}

require_root() {
  if [ "$EUID" -ne 0 ]; then
    fail "Execute como root: sudo bash install.sh"
  fi
}

sanitize_domain() {
  APP_DOMAIN="${APP_DOMAIN#http://}"
  APP_DOMAIN="${APP_DOMAIN#https://}"
  APP_DOMAIN="${APP_DOMAIN%%/*}"
  APP_DOMAIN="${APP_DOMAIN%/}"
}

validate_source_dir() {
  local source_real app_real

  source_real=$(readlink -f "$SOURCE_DIR")
  app_real=$(readlink -f "$APP_DIR" 2>/dev/null || printf '%s' "$APP_DIR")

  if [ -z "$source_real" ]; then
    fail "Não foi possível localizar SOURCE_DIR: $SOURCE_DIR"
  fi

  if [ "$source_real" = "$app_real" ]; then
    fail "Execute o install.sh a partir de uma cópia local fora de $APP_DIR"
  fi

  if [ ! -f "$SOURCE_DIR/package.json" ]; then
    fail "SOURCE_DIR inválido: package.json não encontrado em $SOURCE_DIR"
  fi
}

collect_install_options() {
  sanitize_domain

  if [ -z "$APP_DOMAIN" ] && [ -t 0 ]; then
    printf "Domínio (ex: docs.empresa.com) — deixe vazio para usar apenas IP: "
    read -r APP_DOMAIN
    sanitize_domain
  fi

  if [ -n "$APP_DOMAIN" ]; then
    if [ "$APP_DOMAIN" = "localhost" ] || printf '%s' "$APP_DOMAIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
      fail "Informe um domínio válido, não IP ou localhost"
    fi

    if [ -z "$SSL_EMAIL" ]; then
      SSL_EMAIL="admin@$APP_DOMAIN"
    fi

    SERVER_HOST="$APP_DOMAIN"
    log "SSL será configurado automaticamente para $APP_DOMAIN (email: $SSL_EMAIL)"
  fi

  # Credenciais padrão do administrador (criação automática)
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@axisdocs.com.br}"
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

  if [ ${#ADMIN_PASSWORD} -lt 6 ]; then
    fail "A senha do administrador deve ter no mínimo 6 caracteres"
  fi

  success "Opções coletadas (admin: $ADMIN_EMAIL)"
}

create_admin_user() {
  log "Criando usuário administrador: $ADMIN_EMAIL"

  local encrypted
  encrypted=$(node -e "
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync('$ADMIN_PASSWORD', salt, 64).toString('hex');
    console.log(salt + ':' + hash);
  ")

  sudo -u postgres psql -d "$PG_DB" <<ADMINSQL
DO \$\$
DECLARE
  _uid uuid;
BEGIN
  -- Remove admin anterior com mesmo email (reinstalação)
  DELETE FROM auth.users WHERE email = '${ADMIN_EMAIL}';

  INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
  VALUES ('${ADMIN_EMAIL}', '${encrypted}', now())
  RETURNING id INTO _uid;

  INSERT INTO public.profiles (id, email, role, unit, active, must_change_password)
  VALUES (_uid, '${ADMIN_EMAIL}', 'Administrador', 'Geral', true, true)
  ON CONFLICT (id) DO UPDATE SET role = 'Administrador', unit = 'Geral', active = true, must_change_password = true;
END \$\$;
ADMINSQL

  success "Administrador criado: $ADMIN_EMAIL"
}

wait_apt_lock() {
  local waited=0
  local max_wait="${APT_LOCK_MAX_WAIT:-120}"
  systemctl stop apt-daily.timer apt-daily-upgrade.timer >/dev/null 2>&1 || true
  while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 \
     || fuser /var/lib/dpkg/lock >/dev/null 2>&1 \
     || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 \
     || pgrep -x unattended-upgr >/dev/null 2>&1 \
     || pgrep -x apt >/dev/null 2>&1 \
     || pgrep -x apt-get >/dev/null 2>&1; do
    if [ "$waited" -ge "$max_wait" ]; then
      echo "⚠ O apt/dpkg continuou travado por ${max_wait}s. Tentando liberar atualizações automáticas."
      systemctl stop unattended-upgrades apt-daily.service apt-daily-upgrade.service >/dev/null 2>&1 || true
      pkill -TERM -x unattended-upgr >/dev/null 2>&1 || true
      sleep 2
      if fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 \
        || fuser /var/lib/dpkg/lock >/dev/null 2>&1 \
        || fuser /var/lib/apt/lists/lock >/dev/null 2>&1; then
        echo "❌ O bloqueio do apt/dpkg ainda está ativo. Reinicie o servidor e rode novamente: sudo bash install.sh"
        exit 1
      fi
      dpkg --configure -a >/dev/null 2>&1 || true
      return
    fi
    if [ "$waited" -eq 0 ]; then
      echo "⏳ Aguardando outro processo apt/dpkg liberar o lock (máx. ${max_wait}s)..."
    elif [ $((waited % 30)) -eq 0 ]; then
      echo "⏳ Ainda aguardando liberação do apt/dpkg... ${waited}s"
    fi
    sleep 5
    waited=$((waited + 5))
  done
}

apt_install() {
  wait_apt_lock
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq -o DPkg::Lock::Timeout=120 -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" "$@"
}

apt_update() {
  wait_apt_lock
  DEBIAN_FRONTEND=noninteractive apt-get update -qq -o DPkg::Lock::Timeout=120
}

install_base_packages() {
  log "Atualizando pacotes do sistema"
  apt_update
  apt_install ca-certificates curl gnupg nginx jq openssl psmisc fail2ban
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl start nginx
  success "Dependências base instaladas"
}


install_nodejs() {
  local current_major="0"

  if command -v node >/dev/null 2>&1; then
    current_major=$(node -v | sed 's/^v//' | cut -d'.' -f1)
  fi

  if [ "$current_major" -ge "$NODE_MAJOR" ]; then
    success "Node.js $(node -v) já disponível"
    return
  fi

  log "Instalando Node.js ${NODE_MAJOR}"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
  apt_update
  apt_install nodejs
  success "Node.js $(node -v) instalado"
}

install_postgresql() {
  if command -v psql >/dev/null 2>&1; then
    success "PostgreSQL já instalado"
  else
    log "Instalando PostgreSQL"
    apt_install postgresql postgresql-contrib
    success "PostgreSQL instalado"
  fi

  systemctl enable postgresql
  systemctl start postgresql

  # Gera senha aleatória para o usuário do banco
  PG_PASS=$(openssl rand -hex 16)

  log "Criando banco de dados e usuário"
  sudo -u postgres psql -c "DO \$\$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$PG_USER') THEN
      CREATE ROLE $PG_USER WITH LOGIN PASSWORD '$PG_PASS';
    ELSE
      ALTER ROLE $PG_USER WITH PASSWORD '$PG_PASS';
    END IF;
  END \$\$;" 2>/dev/null

  sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = '$PG_DB'" | grep -q 1 || \
    sudo -u postgres psql -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"

  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;"
  sudo -u postgres psql -d "$PG_DB" -c "GRANT ALL ON SCHEMA public TO $PG_USER;"
  sudo -u postgres psql -d "$PG_DB" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $PG_USER;"

  # Criar extensões necessárias
  sudo -u postgres psql -d "$PG_DB" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
  sudo -u postgres psql -d "$PG_DB" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";"

  # Criar schema auth e funções compatíveis com Supabase
  setup_auth_schema

  success "PostgreSQL configurado: banco '$PG_DB' criado"
}

setup_auth_schema() {
  log "Criando schema de autenticação compatível"

  sudo -u postgres psql -d "$PG_DB" <<'AUTHSQL'
-- Schema auth para compatibilidade com supabase-js
CREATE SCHEMA IF NOT EXISTS auth;

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  encrypted_password text NOT NULL DEFAULT '',
  email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  role text NOT NULL DEFAULT 'authenticated',
  aud text NOT NULL DEFAULT 'authenticated'
);

-- Tabela de sessões/refresh tokens
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id bigserial PRIMARY KEY,
  token text UNIQUE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  revoked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Roles do PostgREST
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;

GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;

-- Função auth.uid() para RLS
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;

-- Função auth.role()
CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'role', '')::text
$$;

-- Permissões para roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Permissões padrão para futuras tabelas
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
AUTHSQL

  success "Schema auth criado"
}

setup_application_database() {
  log "Configurando tabelas da aplicação"

  # Cria as tabelas sem referências a storage.buckets (não existe sem Supabase)
  sudo -u postgres psql -d "$PG_DB" <<'APPSQL'
-- Tabela de perfis de usuários
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true,
  role text NOT NULL DEFAULT 'Usuário',
  unit text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  cpf text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT ''
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf text NOT NULL DEFAULT '';
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

-- Tabela de licença
CREATE TABLE IF NOT EXISTS public.license_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_url text NOT NULL DEFAULT '',
  license_key text NOT NULL DEFAULT '',
  hardware_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'inactive',
  customer_name text DEFAULT '',
  expires_at timestamptz,
  message text DEFAULT '',
  last_check timestamptz,
  temp_unlock_until timestamptz,
  last_temp_unlock_at timestamptz,
  storage_limit_gb numeric NOT NULL DEFAULT 0,
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS server_url text NOT NULL DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS license_key text NOT NULL DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS hardware_id text NOT NULL DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'inactive';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS customer_name text DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS message text DEFAULT '';
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS last_check timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS temp_unlock_until timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS last_temp_unlock_at timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS storage_limit_gb numeric NOT NULL DEFAULT 0;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS storage_used_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE public.license_config ENABLE ROW LEVEL SECURITY;

-- Funções
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

-- RLS Policies (usando DO para evitar erro se já existir)
DO $$ BEGIN
  -- Profiles
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can read own profile or admin reads all' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can read own profile or admin reads all" ON public.profiles
      FOR SELECT TO authenticated USING (auth.uid() = id OR has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own profile with default role' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can insert own profile with default role" ON public.profiles
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = id AND role = 'Usuário');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own profile safely' AND tablename = 'profiles') THEN
    CREATE POLICY "Users can update own profile safely" ON public.profiles
      FOR UPDATE TO authenticated USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update any profile' AND tablename = 'profiles') THEN
    CREATE POLICY "Admins can update any profile" ON public.profiles
      FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'))
      WITH CHECK (has_role(auth.uid(), 'Administrador'));
  END IF;

  -- Categories
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read categories' AND tablename = 'categories') THEN
    CREATE POLICY "Authenticated users can read categories" ON public.categories
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert categories' AND tablename = 'categories') THEN
    CREATE POLICY "Admins can insert categories" ON public.categories
      FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update categories' AND tablename = 'categories') THEN
    CREATE POLICY "Admins can update categories" ON public.categories
      FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can delete categories' AND tablename = 'categories') THEN
    CREATE POLICY "Admins can delete categories" ON public.categories
      FOR DELETE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
  END IF;

  -- Units
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read units' AND tablename = 'units') THEN
    CREATE POLICY "Authenticated users can read units" ON public.units
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can insert units' AND tablename = 'units') THEN
    CREATE POLICY "Admins can insert units" ON public.units
      FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update units' AND tablename = 'units') THEN
    CREATE POLICY "Admins can update units" ON public.units
      FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can delete units' AND tablename = 'units') THEN
    CREATE POLICY "Admins can delete units" ON public.units
      FOR DELETE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
  END IF;

  -- Documents
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users read own or admin reads all documents' AND tablename = 'documents') THEN
    CREATE POLICY "Users read own or admin reads all documents" ON public.documents
      FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert documents' AND tablename = 'documents') THEN
    CREATE POLICY "Authenticated users can insert documents" ON public.documents
      FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own documents' AND tablename = 'documents') THEN
    CREATE POLICY "Users can update own documents" ON public.documents
      FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own documents' AND tablename = 'documents') THEN
    CREATE POLICY "Users can delete own documents" ON public.documents
      FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;

  -- Audit Logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users read own or admin reads all audit logs' AND tablename = 'audit_logs') THEN
    CREATE POLICY "Users read own or admin reads all audit logs" ON public.audit_logs
      FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'Administrador'));
  END IF;

  -- License Config
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins read license config' AND tablename = 'license_config') THEN
    CREATE POLICY "Admins read license config" ON public.license_config
      FOR SELECT TO authenticated USING (has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins insert license config' AND tablename = 'license_config') THEN
    CREATE POLICY "Admins insert license config" ON public.license_config
      FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins update license config' AND tablename = 'license_config') THEN
    CREATE POLICY "Admins update license config" ON public.license_config
      FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
  END IF;
END $$;

-- Dados padrão: idempotente mesmo em instalações locais antigas
INSERT INTO public.categories (name, is_default, active)
SELECT v.name, true, true
FROM (VALUES
  ('Processo Administrativo'), ('Ofício'), ('Contrato'), ('Convênio'), ('Decreto'), ('Portaria'),
  ('Memorando'), ('Ata'), ('Relatório'), ('Nota Fiscal'), ('Parecer'), ('Certidão'),
  ('Alvará'), ('Licença'), ('Requerimento'), ('Despacho'), ('Edital'), ('Lei'),
  ('Resolução'), ('Circular')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE lower(c.name) = lower(v.name));

INSERT INTO public.units (name, is_default, active)
SELECT v.name, true, true
FROM (VALUES
  ('Gabinete'), ('Administração'), ('Saúde'), ('Educação'), ('Finanças'), ('Obras'),
  ('Jurídico'), ('Recursos Humanos'), ('Planejamento'), ('Meio Ambiente'), ('Assistência Social'),
  ('Cultura'), ('Esportes'), ('Tecnologia da Informação'), ('Comunicação'), ('Transporte'),
  ('Licitações'), ('Controle Interno'), ('Tributos'), ('Agricultura')
) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM public.units u WHERE lower(u.name) = lower(v.name));
APPSQL

  # Permissões do owner
  sudo -u postgres psql -d "$PG_DB" -c "GRANT $PG_USER TO authenticator;" 2>/dev/null || true
  # CRÍTICO: PostgREST conecta como $PG_USER e precisa poder fazer SET ROLE para anon/authenticated/service_role
  sudo -u postgres psql -d "$PG_DB" -c "GRANT anon TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "GRANT authenticated TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "GRANT service_role TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "GRANT USAGE ON SCHEMA auth TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "GRANT ALL ON ALL TABLES IN SCHEMA auth TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "ALTER TABLE auth.users OWNER TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "ALTER TABLE auth.refresh_tokens OWNER TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "ALTER SEQUENCE IF EXISTS auth.refresh_tokens_id_seq OWNER TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON TABLES TO $PG_USER;" 2>/dev/null || true
  sudo -u postgres psql -d "$PG_DB" -c "ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT ALL ON SEQUENCES TO $PG_USER;" 2>/dev/null || true

  success "Tabelas da aplicação configuradas"
}

generate_jwt_keys() {
  log "Gerando chaves JWT"

  JWT_SECRET=$(openssl rand -hex 32)

  # Gera anon key (JWT com role=anon)
  ANON_KEY=$(node -e "
    const crypto = require('crypto');
    const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss:'axisdocs',
      ref:'local',
      role:'anon',
      iat:Math.floor(Date.now()/1000),
      exp:Math.floor(Date.now()/1000)+(10*365*24*3600)
    })).toString('base64url');
    const sig = crypto.createHmac('sha256','$JWT_SECRET').update(header+'.'+payload).digest('base64url');
    console.log(header+'.'+payload+'.'+sig);
  ")

  # Gera service_role key
  SERVICE_KEY=$(node -e "
    const crypto = require('crypto');
    const header = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss:'axisdocs',
      ref:'local',
      role:'service_role',
      iat:Math.floor(Date.now()/1000),
      exp:Math.floor(Date.now()/1000)+(10*365*24*3600)
    })).toString('base64url');
    const sig = crypto.createHmac('sha256','$JWT_SECRET').update(header+'.'+payload).digest('base64url');
    console.log(header+'.'+payload+'.'+sig);
  ")

  success "Chaves JWT geradas"
}

install_postgrest() {
  local arch
  arch=$(dpkg --print-architecture)

  if [ "$arch" = "amd64" ]; then
    arch="linux-static-x64"
  elif [ "$arch" = "arm64" ]; then
    arch="linux-static-aarch64"
  else
    fail "Arquitetura não suportada para PostgREST: $arch"
  fi

  log "Instalando PostgREST ${POSTGREST_VERSION}"
  local url="https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-${arch}.tar.xz"

  curl -fsSL "$url" -o /tmp/postgrest.tar.xz
  tar -xJf /tmp/postgrest.tar.xz -C /usr/local/bin/
  chmod +x /usr/local/bin/postgrest
  rm -f /tmp/postgrest.tar.xz

  # Configuração do PostgREST
  mkdir -p /etc/axisdocs
  cat > /etc/axisdocs/postgrest.conf <<EOF_PREST
db-uri = "postgres://$PG_USER:$PG_PASS@localhost:5432/$PG_DB"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public,auth"
jwt-secret = "$JWT_SECRET"
server-port = 3001
server-host = "127.0.0.1"
jwt-secret-is-base64 = false
EOF_PREST

  # Serviço systemd
  cat > /etc/systemd/system/postgrest.service <<EOF_SVC
[Unit]
Description=PostgREST API
After=postgresql.service
Requires=postgresql.service

[Service]
ExecStart=/usr/local/bin/postgrest /etc/axisdocs/postgrest.conf
Restart=always
RestartSec=5
User=nobody
Group=nogroup

[Install]
WantedBy=multi-user.target
EOF_SVC

  systemctl daemon-reload
  systemctl enable postgrest
  systemctl start postgrest

  success "PostgREST instalado e rodando na porta 3001"
}

install_auth_server() {
  log "Instalando servidor de autenticação"

  mkdir -p /opt/axisdocs-auth
  mkdir -p /var/lib/axisdocs/storage

  # Cria servidor auth em Node.js (compatível com supabase-js)
  cat > /opt/axisdocs-auth/server.js <<'AUTHSERVER'
const http = require("http");
const crypto = require("crypto");
const { Pool } = require("pg");
const url = require("url");

const PORT = 9999;
const JWT_SECRET = process.env.JWT_SECRET;
const DB_URL = process.env.DATABASE_URL;

const pool = new Pool({ connectionString: DB_URL });

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(header + "." + body).digest("base64url");
  return header + "." + body + "." + sig;
}

function verifyJwt(token) {
  try {
    const [header, payload, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(header + "." + payload).digest("base64url");
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch { return null; }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === test;
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });
  res.end(JSON.stringify(data));
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

async function createSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = signJwt({
    sub: user.id, email: user.email, role: "authenticated",
    iss: "axisdocs", iat: now, exp: now + 3600,
    aud: "authenticated"
  });
  const refreshToken = crypto.randomBytes(40).toString("hex");
  await pool.query(
    "INSERT INTO auth.refresh_tokens (token, user_id) VALUES ($1, $2)",
    [refreshToken, user.id]
  );
  return {
    access_token: accessToken, token_type: "bearer",
    expires_in: 3600, expires_at: now + 3600,
    refresh_token: refreshToken,
    user: { id: user.id, email: user.email, role: "authenticated",
      aud: "authenticated", created_at: user.created_at,
      email_confirmed_at: user.email_confirmed_at,
      user_metadata: user.raw_user_meta_data || {} }
  };
}

async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const path = parsed.pathname.replace(/\/+$/, "");

  if (req.method === "OPTIONS") { json(res, 200, {}); return; }

  // POST /auth/v1/signup
  if (req.method === "POST" && path === "/auth/v1/signup") {
    const body = await readBody(req);
    const { email, password } = body;
    if (!email || !password) return json(res, 400, { error: "email and password required" });

    const existing = await pool.query("SELECT id FROM auth.users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return json(res, 400, { error: "User already registered", msg: "User already registered" });

    const encrypted = hashPassword(password);
    const result = await pool.query(
      "INSERT INTO auth.users (email, encrypted_password, email_confirmed_at) VALUES ($1, $2, now()) RETURNING *",
      [email, encrypted]
    );
    const user = result.rows[0];

    // Cria profile automaticamente
    await pool.query(
      "INSERT INTO public.profiles (id, email, role, unit) VALUES ($1, $2, 'Usuário', '') ON CONFLICT (id) DO NOTHING",
      [user.id, user.email]
    );

    const session = await createSession(user);
    return json(res, 200, session);
  }

  // POST /auth/v1/token?grant_type=password
  if (req.method === "POST" && path === "/auth/v1/token") {
    const grantType = parsed.query.grant_type;

    if (grantType === "password") {
      const body = await readBody(req);
      const { email, password } = body;
      const result = await pool.query("SELECT * FROM auth.users WHERE email = $1", [email]);
      if (result.rows.length === 0) return json(res, 400, { error: "Invalid login credentials" });

      const user = result.rows[0];
      if (!verifyPassword(password, user.encrypted_password))
        return json(res, 400, { error: "Invalid login credentials" });

      // Verifica se perfil está ativo
      const profile = await pool.query("SELECT active FROM public.profiles WHERE id = $1", [user.id]);
      if (profile.rows.length > 0 && !profile.rows[0].active)
        return json(res, 400, { error: "User account is disabled" });

      const session = await createSession(user);
      return json(res, 200, session);
    }

    if (grantType === "refresh_token") {
      const body = await readBody(req);
      const { refresh_token } = body;
      const result = await pool.query(
        "SELECT rt.*, u.* FROM auth.refresh_tokens rt JOIN auth.users u ON u.id = rt.user_id WHERE rt.token = $1 AND rt.revoked = false",
        [refresh_token]
      );
      if (result.rows.length === 0) return json(res, 400, { error: "Invalid refresh token" });

      await pool.query("UPDATE auth.refresh_tokens SET revoked = true WHERE token = $1", [refresh_token]);
      const user = result.rows[0];
      const session = await createSession({ id: user.user_id, email: user.email, created_at: user.created_at, email_confirmed_at: user.email_confirmed_at, raw_user_meta_data: user.raw_user_meta_data });
      return json(res, 200, session);
    }

    return json(res, 400, { error: "Unsupported grant type" });
  }

  // GET /auth/v1/user
  if (req.method === "GET" && path === "/auth/v1/user") {
    const token = getToken(req);
    if (!token) return json(res, 401, { error: "No token" });
    const claims = verifyJwt(token);
    if (!claims) return json(res, 401, { error: "Invalid token" });

    const result = await pool.query("SELECT * FROM auth.users WHERE id = $1", [claims.sub]);
    if (result.rows.length === 0) return json(res, 404, { error: "User not found" });
    const u = result.rows[0];
    return json(res, 200, {
      id: u.id, email: u.email, role: "authenticated",
      aud: "authenticated", created_at: u.created_at,
      email_confirmed_at: u.email_confirmed_at,
      user_metadata: u.raw_user_meta_data || {}
    });
  }

  // POST /auth/v1/logout
  if (req.method === "POST" && path === "/auth/v1/logout") {
    const token = getToken(req);
    if (token) {
      const claims = verifyJwt(token);
      if (claims) {
        await pool.query("UPDATE auth.refresh_tokens SET revoked = true WHERE user_id = $1", [claims.sub]);
      }
    }
    return json(res, 200, {});
  }

  // POST /auth/v1/recover (password reset - envia log, sem email real)
  if (req.method === "POST" && path === "/auth/v1/recover") {
    const body = await readBody(req);
    console.log("[AUTH] Password reset requested for:", body.email);
    return json(res, 200, {});
  }

  // PUT /auth/v1/user (update user)
  if (req.method === "PUT" && path === "/auth/v1/user") {
    const token = getToken(req);
    if (!token) return json(res, 401, { error: "No token" });
    const claims = verifyJwt(token);
    if (!claims) return json(res, 401, { error: "Invalid token" });

    const body = await readBody(req);
    if (body.password) {
      const encrypted = hashPassword(body.password);
      await pool.query("UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2", [encrypted, claims.sub]);
    }
    const result = await pool.query("SELECT * FROM auth.users WHERE id = $1", [claims.sub]);
    const u = result.rows[0];
    return json(res, 200, {
      id: u.id, email: u.email, role: "authenticated",
      user_metadata: u.raw_user_meta_data || {}
    });
  }

  // ============= ADMIN ENDPOINTS =============
  // POST /auth/v1/admin/users?action=create|toggle|delete|reset-password
  if (req.method === "POST" && path === "/auth/v1/admin/users") {
    const token = getToken(req);
    if (!token) return json(res, 401, { error: "Não autorizado" });
    const claims = verifyJwt(token);
    if (!claims) return json(res, 401, { error: "Token inválido" });

    // Verifica se quem chama é Administrador ou Operador ativo
    let adminCheck = await pool.query(
      "SELECT id, role, active FROM public.profiles WHERE id = $1",
      [claims.sub]
    );
    if (adminCheck.rows.length === 0 && claims.email) {
      adminCheck = await pool.query(
        `SELECT p.id, p.role, p.active
           FROM public.profiles p
           LEFT JOIN auth.users u ON u.id = p.id
          WHERE lower(u.email) = lower($1) OR lower(p.email) = lower($1)
          ORDER BY p.created_at DESC
          LIMIT 1`,
        [claims.email]
      );
      if (adminCheck.rows.length > 0) {
        console.warn("[ADMIN] JWT sub sem perfil; perfil recuperado por e-mail:", claims.email);
      }
    }
    if (adminCheck.rows.length === 0) {
      console.warn("[ADMIN] Perfil não encontrado para JWT sub:", claims.sub);
      return json(res, 403, { error: "Perfil não encontrado para o usuário autenticado. Faça logout e login novamente." });
    }
    const callerRole = (adminCheck.rows[0]?.role || "").toString().trim();
    const callerActive = !!adminCheck.rows[0]?.active;
    const isAdmin = callerRole.toLowerCase() === "administrador";
    const isOperator = callerRole.toLowerCase() === "operador";
    if (!callerActive) {
      return json(res, 403, { error: "Sua conta está inativa. Contate o administrador." });
    }
    if (!isAdmin && !isOperator) {
      console.warn("[ADMIN] Role insuficiente:", JSON.stringify(callerRole));
      return json(res, 403, { error: `Permissão negada: seu perfil é "${callerRole}". Apenas Administrador/Operador podem executar esta ação.` });
    }

    const action = parsed.query.action;
    const body = await readBody(req);

    // Operador só pode criar usuários; demais ações são exclusivas de Administrador
    if (!isAdmin && !(isOperator && action === "create")) {
      return json(res, 403, { error: "Permissão negada para esta ação" });
    }

    if (action === "create") {
      const { email, password, role, unit, full_name, cpf } = body;
      if (!email || !password) return json(res, 400, { error: "E-mail e senha são obrigatórios" });

      const requestedRole = role || "Usuário";
      const allowedRoles = isAdmin
        ? ["Administrador", "Operador", "Usuário"]
        : ["Operador", "Usuário"];
      if (!allowedRoles.includes(requestedRole)) {
        return json(res, 403, { error: "Perfil não permitido para o seu nível de acesso" });
      }

      const existing = await pool.query("SELECT id FROM auth.users WHERE email = $1", [email]);
      if (existing.rows.length > 0) return json(res, 400, { error: "Usuário já cadastrado" });

      const encrypted = hashPassword(password);
      const result = await pool.query(
        "INSERT INTO auth.users (email, encrypted_password, email_confirmed_at) VALUES ($1, $2, now()) RETURNING *",
        [email, encrypted]
      );
      const newUser = result.rows[0];

      await pool.query(
        "INSERT INTO public.profiles (id, email, role, unit, full_name, cpf, active, must_change_password) VALUES ($1, $2, $3, $4, $5, $6, true, true) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role, unit = EXCLUDED.unit, full_name = EXCLUDED.full_name, cpf = EXCLUDED.cpf, active = true, must_change_password = true",
        [newUser.id, email, requestedRole, unit || "", full_name || "", cpf || ""]
      );

      return json(res, 200, { user: { id: newUser.id, email: newUser.email } });
    }

    if (action === "toggle") {
      const { userId, active } = body;
      if (!userId) return json(res, 400, { error: "ID do usuário é obrigatório" });
      await pool.query("UPDATE public.profiles SET active = $1 WHERE id = $2", [!!active, userId]);
      return json(res, 200, { success: true });
    }

    if (action === "delete") {
      const { userId } = body;
      if (!userId) return json(res, 400, { error: "ID do usuário é obrigatório" });
      await pool.query("DELETE FROM auth.refresh_tokens WHERE user_id = $1", [userId]);
      await pool.query("DELETE FROM public.profiles WHERE id = $1", [userId]);
      await pool.query("DELETE FROM auth.users WHERE id = $1", [userId]);
      return json(res, 200, { success: true });
    }

    if (action === "reset-password") {
      const { userId, newPassword } = body;
      if (!userId || !newPassword) return json(res, 400, { error: "ID do usuário e nova senha são obrigatórios" });
      const encrypted = hashPassword(newPassword);
      await pool.query(
        "UPDATE auth.users SET encrypted_password = $1, updated_at = now() WHERE id = $2",
        [encrypted, userId]
      );
      await pool.query(
        "UPDATE public.profiles SET must_change_password = true WHERE id = $1",
        [userId]
      );
      return json(res, 200, { success: true });
    }

    if (action === "update") {
      const { userId, role, unit, full_name, cpf } = body;
      if (!userId) return json(res, 400, { error: "ID do usuário é obrigatório" });
      const allowedRoles = isAdmin
        ? ["Administrador", "Operador", "Usuário"]
        : ["Operador", "Usuário"];
      const sets = [];
      const vals = [];
      let i = 1;
      if (typeof role === "string") {
        if (!allowedRoles.includes(role)) return json(res, 403, { error: "Perfil não permitido para o seu nível de acesso" });
        sets.push(`role = $${i++}`); vals.push(role);
      }
      if (typeof unit === "string") { sets.push(`unit = $${i++}`); vals.push(unit); }
      if (typeof full_name === "string") { sets.push(`full_name = $${i++}`); vals.push(full_name); }
      if (typeof cpf === "string") { sets.push(`cpf = $${i++}`); vals.push(cpf); }
      if (sets.length === 0) return json(res, 200, { success: true });
      vals.push(userId);
      await pool.query(`UPDATE public.profiles SET ${sets.join(", ")} WHERE id = $${i}`, vals);
      return json(res, 200, { success: true });
    }

    return json(res, 400, { error: "Ação inválida" });
  }

  // GET /auth/v1/admin/users - lista todos os usuários (apenas admin)
  if (req.method === "GET" && path === "/auth/v1/admin/users") {
    const token = getToken(req);
    if (!token) return json(res, 401, { error: "Não autorizado" });
    const claims = verifyJwt(token);
    if (!claims) return json(res, 401, { error: "Token inválido" });

    const adminCheck = await pool.query(
      "SELECT role, active FROM public.profiles WHERE id = $1",
      [claims.sub]
    );
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== "Administrador" || !adminCheck.rows[0].active) {
      return json(res, 403, { error: "Apenas administradores podem listar usuários" });
    }

    const result = await pool.query("SELECT id, email, created_at, email_confirmed_at FROM auth.users ORDER BY created_at DESC");
    return json(res, 200, { users: result.rows });
  }

  json(res, 404, { error: "Not found" });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  try { await handleRequest(req, res); }
  catch (e) { console.error("[AUTH ERROR]", e); json(res, 500, { error: "Internal server error" }); }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Auth server running on port ${PORT}`));
AUTHSERVER

  # Instalar pg driver para o auth server
  cd /opt/axisdocs-auth
  npm init -y >/dev/null 2>&1
  npm install --no-fund --no-audit pg >/dev/null 2>&1

  # Serviço systemd
  cat > /etc/systemd/system/axisdocs-auth.service <<EOF_AUTH
[Unit]
Description=AxisDocs Auth Server
After=postgresql.service
Requires=postgresql.service

[Service]
ExecStart=/usr/bin/node /opt/axisdocs-auth/server.js
Restart=always
RestartSec=5
Environment=JWT_SECRET=$JWT_SECRET
Environment=DATABASE_URL=postgres://$PG_USER:$PG_PASS@localhost:5432/$PG_DB
WorkingDirectory=/opt/axisdocs-auth

[Install]
WantedBy=multi-user.target
EOF_AUTH

  systemctl daemon-reload
  systemctl enable axisdocs-auth
  systemctl start axisdocs-auth

  success "Servidor de autenticação rodando na porta 9999"
}

install_storage_server() {
  log "Instalando servidor de armazenamento local"

  mkdir -p /opt/axisdocs-storage
  mkdir -p /var/lib/axisdocs/storage/documents
  mkdir -p /var/lib/axisdocs/storage/settings

  cat > /opt/axisdocs-storage/server.js <<'STORAGESERVER'
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const url = require("url");

const PORT = 5555;
const STORAGE_DIR = "/var/lib/axisdocs/storage";
const JWT_SECRET = process.env.JWT_SECRET;

function verifyJwt(token) {
  try {
    const [header, payload, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(header + "." + payload).digest("base64url");
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch { return null; }
}

function json(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*"
  });
  res.end(JSON.stringify(data));
}

function getAuth(req) {
  const auth = req.headers.authorization || "";
  const apikey = req.headers.apikey || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : apikey;
  if (!token) return null;
  return verifyJwt(token);
}

async function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathParts = parsed.pathname.replace(/^\/storage\/v1\//, "").split("/").filter(Boolean);

  if (req.method === "OPTIONS") return json(res, 200, {});

  const claims = getAuth(req);

  // POST /storage/v1/object/{bucket}/{path} - Upload
  if (req.method === "POST" && pathParts[0] === "object" && pathParts.length >= 2) {
    if (!claims) return json(res, 401, { error: "Unauthorized" });

    const bucket = pathParts[1];
    const filePath = pathParts.slice(2).join("/");
    const bucketDir = path.join(STORAGE_DIR, bucket);

    if (!fs.existsSync(bucketDir)) fs.mkdirSync(bucketDir, { recursive: true });

    const fullPath = path.join(bucketDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);

      // Handle multipart form data
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("multipart/form-data")) {
        const boundary = contentType.split("boundary=")[1];
        if (boundary) {
          const parts = body.toString("binary").split("--" + boundary);
          for (const part of parts) {
            if (part.includes("Content-Disposition") && part.includes("filename")) {
              const headerEnd = part.indexOf("\r\n\r\n") + 4;
              const fileData = part.slice(headerEnd).replace(/\r\n$/, "");
              fs.writeFileSync(fullPath, Buffer.from(fileData, "binary"));
              return json(res, 200, { Key: bucket + "/" + filePath });
            }
          }
        }
      }

      fs.writeFileSync(fullPath, body);
      json(res, 200, { Key: bucket + "/" + filePath });
    });
    return;
  }

  // GET /storage/v1/object/{bucket}/{path} - Download
  if (req.method === "GET" && pathParts[0] === "object" && pathParts.length >= 2) {
    const bucket = pathParts[1];
    const filePath = pathParts.slice(2).join("/");
    const fullPath = path.join(STORAGE_DIR, bucket, filePath);

    if (!fs.existsSync(fullPath)) return json(res, 404, { error: "Not found" });

    const stat = fs.statSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeTypes = {
      ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
      ".json": "application/json", ".txt": "text/plain"
    };

    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Content-Length": stat.size,
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(fullPath).pipe(res);
    return;
  }

  // POST /storage/v1/object/sign/{bucket}/{path} - Signed URL
  if (req.method === "POST" && pathParts[0] === "object" && pathParts[1] === "sign") {
    if (!claims) return json(res, 401, { error: "Unauthorized" });
    const bucket = pathParts[2];
    const filePath = pathParts.slice(3).join("/");
    const signedToken = crypto.randomBytes(20).toString("hex");
    // Store token temporarily (simple in-memory for now)
    global._signedUrls = global._signedUrls || {};
    global._signedUrls[signedToken] = { bucket, path: filePath, exp: Date.now() + 3600000 };
    return json(res, 200, { signedURL: `/storage/v1/object/sign/${bucket}/${filePath}?token=${signedToken}` });
  }

  // GET with token param (signed URL access)
  if (req.method === "GET" && parsed.query.token) {
    const entry = (global._signedUrls || {})[parsed.query.token];
    if (!entry || entry.exp < Date.now()) return json(res, 403, { error: "Expired" });
    const fullPath = path.join(STORAGE_DIR, entry.bucket, entry.path);
    if (!fs.existsSync(fullPath)) return json(res, 404, { error: "Not found" });
    const stat = fs.statSync(fullPath);
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": stat.size, "Access-Control-Allow-Origin": "*" });
    fs.createReadStream(fullPath).pipe(res);
    return;
  }

  // DELETE /storage/v1/object/{bucket}/{path}
  if (req.method === "DELETE" && pathParts[0] === "object" && pathParts.length >= 2) {
    if (!claims) return json(res, 401, { error: "Unauthorized" });
    const bucket = pathParts[1];
    const filePath = pathParts.slice(2).join("/");
    const fullPath = path.join(STORAGE_DIR, bucket, filePath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    return json(res, 200, { message: "Deleted" });
  }

  // LIST /storage/v1/object/list/{bucket}
  if (req.method === "POST" && pathParts[0] === "object" && pathParts[1] === "list") {
    const bucket = pathParts[2];
    const bucketDir = path.join(STORAGE_DIR, bucket);
    const body = await readBody(req);
    const prefix = body.prefix || "";
    const searchDir = path.join(bucketDir, prefix);

    if (!fs.existsSync(searchDir)) return json(res, 200, []);

    const files = fs.readdirSync(searchDir).map((name) => {
      const stat = fs.statSync(path.join(searchDir, name));
      return { name, id: name, metadata: { size: stat.size }, created_at: stat.birthtime, updated_at: stat.mtime };
    });
    return json(res, 200, files);
  }

  json(res, 404, { error: "Not found" });
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  try { await handleRequest(req, res); }
  catch (e) { console.error("[STORAGE ERROR]", e); json(res, 500, { error: "Internal server error" }); }
});

server.listen(PORT, "127.0.0.1", () => console.log(`Storage server running on port ${PORT}`));
STORAGESERVER

  # Serviço systemd
  cat > /etc/systemd/system/axisdocs-storage.service <<EOF_STOR
[Unit]
Description=AxisDocs Storage Server
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/axisdocs-storage/server.js
Restart=always
RestartSec=5
Environment=JWT_SECRET=$JWT_SECRET
WorkingDirectory=/opt/axisdocs-storage

[Install]
WantedBy=multi-user.target
EOF_STOR

  systemctl daemon-reload
  systemctl enable axisdocs-storage
  systemctl start axisdocs-storage

  success "Servidor de armazenamento rodando na porta 5555"
}

install_local_functions() {
  log "Instalando servidor de funções locais (Drive / assinatura)"

  mkdir -p /opt/axisdocs-functions

  # Garante dependências do auth-server reaproveitáveis (pg, crypto nativo)
  if [ ! -d /opt/axisdocs-auth/node_modules/pg ]; then
    cd /opt/axisdocs-auth && npm install pg --no-fund --no-audit >/dev/null 2>&1 || true
  fi
  ln -sfn /opt/axisdocs-auth/node_modules /opt/axisdocs-functions/node_modules

  cat > /opt/axisdocs-functions/server.js <<'FUNCSERVER'
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { Client } = require("pg");
const { spawn } = require("child_process");

const PORT = 5556;
const STORAGE_DIR = "/var/lib/axisdocs/storage";
const APP_DIR = "/opt/axisdocs";
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Expose-Headers": "*",
};

function json(res, status, data) {
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function verifyJwt(token) {
  try {
    const [header, payload, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(header + "." + payload).digest("base64url");
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch { return null; }
}

function getAuth(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  return verifyJwt(token);
}

async function withDb(fn) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try { return await fn(client); }
  finally { await client.end(); }
}

async function requireAdmin(claims) {
  return withDb(async (db) => {
    const r = await db.query("SELECT role, active FROM public.profiles WHERE id = $1", [claims.sub]);
    return r.rows[0]?.role === "Administrador" && r.rows[0]?.active === true;
  });
}

function normalizeLicenseServerUrl(serverUrl) {
  const trimmed = String(serverUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    if (!u.pathname || u.pathname === "/" || u.pathname === "/admin") return `${u.origin}/api/public/license/check`;
  } catch {}
  return trimmed;
}

function parseStorageGb(input) {
  if (input == null) return 0;
  if (typeof input === "number") return input;
  if (typeof input === "string") return Number(input) || 0;
  const unit = String(input.unit ?? input.units ?? "GB").toUpperCase();
  const amount = Number(input.total ?? input.total_amount ?? input.total_gb ?? input.amount ?? input.value ?? input.size ?? 0) || 0;
  if (unit === "TB") return amount * 1024;
  if (unit === "MB") return amount / 1024;
  if (unit === "KB") return amount / (1024 * 1024);
  return amount;
}

function readBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const buf = await readBuffer(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString("utf8")); } catch { return {}; }
}

function loadDriveConfig() {
  const file = path.join(STORAGE_DIR, "settings", "google-drive-config.json");
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function extractFolderId(input) {
  if (!input) return "";
  const m = String(input).match(/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : String(input).trim();
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getGoogleAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer.sign(sa.private_key);
  const jwt = `${header}.${payload}.${b64url(signature)}`;

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const res = await httpRequest(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (res.status >= 300) throw new Error(`Token error: ${res.body.toString()}`);
  return JSON.parse(res.body.toString()).access_token;
}

function httpRequest(urlStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request({
      method: opts.method || "GET",
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      headers: opts.headers || {},
    }, (resp) => {
      const chunks = [];
      resp.on("data", (c) => chunks.push(c));
      resp.on("end", () => resolve({
        status: resp.statusCode,
        headers: resp.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function findOrCreateFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await httpRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status >= 300) throw new Error(`Drive list error: ${r.body.toString()}`);
  const data = JSON.parse(r.body.toString());
  if (data.files && data.files[0]) return data.files[0].id;

  const c = await httpRequest("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  if (c.status >= 300) throw new Error(`Drive create folder error: ${c.body.toString()}`);
  return JSON.parse(c.body.toString()).id;
}

// Parser simples de multipart/form-data para extrair file e fields
function parseMultipart(buffer, boundary) {
  const result = { fields: {}, file: null };
  const boundaryBuf = Buffer.from(`--${boundary}`);
  let start = 0;
  while (true) {
    const idx = buffer.indexOf(boundaryBuf, start);
    if (idx < 0) break;
    const next = buffer.indexOf(boundaryBuf, idx + boundaryBuf.length);
    if (next < 0) break;
    const part = buffer.slice(idx + boundaryBuf.length, next);
    // skip leading \r\n
    let p = part;
    if (p[0] === 0x0d && p[1] === 0x0a) p = p.slice(2);
    const headerEnd = p.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) { start = next; continue; }
    const headers = p.slice(0, headerEnd).toString("utf8");
    let body = p.slice(headerEnd + 4);
    // remove trailing \r\n
    if (body.length >= 2 && body[body.length-2] === 0x0d && body[body.length-1] === 0x0a) {
      body = body.slice(0, body.length - 2);
    }
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]*)"/);
    const ctMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
    if (!nameMatch) { start = next; continue; }
    const name = nameMatch[1];
    if (filenameMatch) {
      result.file = {
        fieldName: name,
        filename: filenameMatch[1],
        contentType: ctMatch ? ctMatch[1].trim() : "application/octet-stream",
        data: body,
      };
    } else {
      result.fields[name] = body.toString("utf8");
    }
    start = next;
  }
  return result;
}

// ============ Endpoints ============

async function uploadToDrive(req, res, claims) {
  const ct = req.headers["content-type"] || "";
  const boundaryMatch = ct.match(/boundary=([^;]+)/);
  if (!boundaryMatch) return json(res, 400, { error: "Content-Type multipart/form-data esperado" });
  const buf = await readBuffer(req);
  const parsed = parseMultipart(buf, boundaryMatch[1].trim());
  if (!parsed.file) return json(res, 400, { error: "Arquivo é obrigatório" });

  const fileName = parsed.fields.fileName || parsed.file.filename || "arquivo";
  const unitName = parsed.fields.unitName || "";
  const mimeType = parsed.file.contentType || "application/octet-stream";

  const config = loadDriveConfig();
  if (!config) return json(res, 400, { error: "Google Drive não configurado. Configure em Configurações." });
  if (!config.serviceAccount?.client_email || !config.serviceAccount?.private_key) {
    return json(res, 400, { error: "Configuração do Google Drive incompleta." });
  }
  const rootFolderId = extractFolderId(config.rootFolderId);
  if (!rootFolderId) return json(res, 400, { error: "ID da pasta raiz do Google Drive não configurado." });

  const token = await getGoogleAccessToken(config.serviceAccount);
  let target = rootFolderId;
  if (unitName) target = await findOrCreateFolder(token, unitName, rootFolderId);

  const boundary = `boundary${Date.now()}`;
  const metadata = JSON.stringify({ name: fileName, parents: [target] });
  const meta = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`);
  const med = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const end = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([meta, med, parsed.file.data, end]);

  const up = await httpRequest("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true&enforceSingleParent=true", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body,
  });
  if (up.status >= 300) {
    console.error("[upload-to-drive] error", up.status, up.body.toString().slice(0, 500));
    return json(res, 500, { error: `Google Drive upload failed [${up.status}]: ${up.body.toString()}` });
  }
  const driveFile = JSON.parse(up.body.toString());
  return json(res, 200, {
    success: true,
    driveFileId: driveFile.id,
    driveFileName: driveFile.name,
    driveLink: driveFile.webViewLink,
  });
}

async function serveDriveFile(req, res, claims) {
  const body = await readJson(req);
  const driveFileId = body.driveFileId;
  if (!driveFileId) return json(res, 400, { error: "driveFileId é obrigatório" });
  const config = loadDriveConfig();
  if (!config?.serviceAccount?.client_email) return json(res, 400, { error: "Google Drive não configurado." });
  const token = await getGoogleAccessToken(config.serviceAccount);
  const r = await httpRequest(`https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status >= 300) return json(res, r.status, { error: r.body.toString() });
  res.writeHead(200, {
    ...CORS,
    "Content-Type": r.headers["content-type"] || "application/octet-stream",
    "Content-Length": r.body.length,
  });
  res.end(r.body);
}

async function deleteFromDrive(req, res, claims) {
  const body = await readJson(req);
  const driveFileId = body.driveFileId;
  if (!driveFileId) return json(res, 400, { error: "driveFileId é obrigatório" });
  const config = loadDriveConfig();
  if (!config?.serviceAccount?.client_email) return json(res, 400, { error: "Google Drive não configurado." });
  const token = await getGoogleAccessToken(config.serviceAccount);
  const r = await httpRequest(`https://www.googleapis.com/drive/v3/files/${driveFileId}?supportsAllDrives=true`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status >= 300 && r.status !== 404) {
    return json(res, 500, { error: `Falha ao excluir do Drive: ${r.body.toString()}` });
  }
  return json(res, 200, { success: true });
}

async function validateLicense(req, res, claims) {
  const isAdmin = await requireAdmin(claims);
  if (!isAdmin) return json(res, 403, { error: "Permissão negada" });

  const config = await withDb(async (db) => {
    const r = await db.query("SELECT * FROM public.license_config ORDER BY updated_at DESC LIMIT 1");
    return r.rows[0] || null;
  });

  if (config?.temp_unlock_until && new Date(config.temp_unlock_until).getTime() > Date.now()) {
    return json(res, 200, {
      status: "active",
      customer_name: config.customer_name || "",
      expires_at: config.expires_at,
      message: `Desbloqueio temporário ativo até ${new Date(config.temp_unlock_until).toLocaleString("pt-BR")}`,
      last_check: config.last_check,
      temp_unlock_until: config.temp_unlock_until,
      storage_limit_gb: Number(config.storage_limit_gb || 0),
      storage_used_bytes: Number(config.storage_used_bytes || 0),
    });
  }

  if (!config?.server_url || !config?.license_key) {
    return json(res, 200, { status: "inactive", message: "Licença não configurada. Cadastre a URL do servidor e a chave." });
  }

  let serverStatus = "unreachable";
  let serverData = {};
  let errorMessage = "";
  try {
    const r = await httpRequest(normalizeLicenseServerUrl(config.server_url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: config.license_key, hostname: config.hardware_id || "axisdocs" }),
    });
    try { serverData = JSON.parse(r.body.toString() || "{}"); } catch { serverData = {}; }
    const apiStatus = String(serverData.status || "").toLowerCase();
    if (serverData.ok === true || apiStatus === "active" || apiStatus === "ok") serverStatus = "active";
    else if (serverData.blocked === true || apiStatus === "blocked" || apiStatus === "cancelled") serverStatus = "blocked";
    else if (serverData.expired === true || apiStatus === "expired") serverStatus = "expired";
    else if (apiStatus === "invalid" || r.status === 404 || r.status === 400) serverStatus = "invalid";
    else if (apiStatus === "pending") serverStatus = "inactive";
    else serverStatus = r.status < 300 ? "active" : "blocked";
  } catch (e) {
    errorMessage = `Servidor de licença inacessível: ${e?.message || e}`;
    serverStatus = config.status === "active" ? "active" : "unreachable";
  }

  const storageLimitGb = parseStorageGb(serverData.storage_limit_gb) || parseStorageGb(serverData.storage_gb) || parseStorageGb(serverData.storage) || Number(config.storage_limit_gb || 0);
  const updated = await withDb(async (db) => {
    const docs = await db.query("SELECT COALESCE(SUM(file_size),0)::bigint AS used FROM public.documents");
    const storageUsedBytes = Number(docs.rows[0]?.used || 0);
    const r = await db.query(`
      UPDATE public.license_config
      SET status=$1, last_check=now(), server_url=$2, message=$3, customer_name=$4, expires_at=COALESCE($5::timestamptz, expires_at),
          storage_limit_gb=$6, storage_used_bytes=$7, updated_at=now(), updated_by=$8
      WHERE id=$9 RETURNING *
    `, [
      serverStatus,
      normalizeLicenseServerUrl(config.server_url),
      serverData.reason || serverData.message || errorMessage || "",
      serverData.customer_name || serverData.customer || config.customer_name || "",
      serverData.expires_at || serverData.expiresAt || null,
      storageLimitGb,
      storageUsedBytes,
      claims.sub,
      config.id,
    ]);
    return r.rows[0];
  });

  return json(res, 200, updated);
}

async function licenseTempUnlock(req, res, claims) {
  const isAdmin = await requireAdmin(claims);
  if (!isAdmin) return json(res, 403, { ok: false, message: "Permissão negada" });

  const result = await withDb(async (db) => {
    const r = await db.query("SELECT * FROM public.license_config ORDER BY updated_at DESC LIMIT 1");
    const config = r.rows[0];
    if (!config) return { ok: false, message: "Configuração de licença não encontrada." };
    const last = config.last_temp_unlock_at ? new Date(config.last_temp_unlock_at).getTime() : 0;
    const now = Date.now();
    if (last && now - last < 30 * 24 * 60 * 60 * 1000) {
      const next = new Date(last + 30 * 24 * 60 * 60 * 1000);
      return { ok: false, message: `Desbloqueio temporário já utilizado este mês. Próximo disponível em ${next.toLocaleString("pt-BR")}.`, next_allowed_at: next.toISOString() };
    }
    const until = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    await db.query(
      "UPDATE public.license_config SET temp_unlock_until=$1, last_temp_unlock_at=now(), message=$2, updated_at=now(), updated_by=$3 WHERE id=$4",
      [until, `Desbloqueio temporário ativo até ${new Date(until).toLocaleString("pt-BR")}`, claims.sub, config.id]
    );
    return { ok: true, valid_until: until };
  });
  return json(res, result.ok ? 200 : 400, result);
}

async function systemVersion(req, res) {
  let commit, built_at, branch;
  try {
    const raw = fs.readFileSync(path.join(APP_DIR, "VERSION"), "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (!m) return;
      if (m[1] === "COMMIT") commit = m[2];
      if (m[1] === "BUILT_AT") built_at = m[2];
      if (m[1] === "BRANCH") branch = m[2];
    });
  } catch {}
  return json(res, 200, { commit, built_at, branch });
}

async function systemUpdate(req, res, claims) {
  if (!(await requireAdmin(claims))) return json(res, 403, { ok: false, message: "Apenas administradores" });
  const updateScript = path.join(APP_DIR, "update.sh");
  if (!fs.existsSync(updateScript)) {
    return json(res, 400, { ok: false, message: "Script update.sh não encontrado. Use a instalação local." });
  }
  try {
    const out = fs.openSync("/var/log/axisdocs-update.log", "a");
    const child = spawn("bash", [updateScript], { detached: true, stdio: ["ignore", out, out] });
    child.unref();
    return json(res, 200, { ok: true, pid: child.pid, message: "Atualização iniciada em background" });
  } catch (e) {
    return json(res, 500, { ok: false, message: e.message });
  }
}

async function handle(req, res) {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, "http://localhost");
  const fnPath = url.pathname.replace(/^\/functions\/v1\//, "");

  // system-version é público (mostra versão da instalação)
  if (fnPath === "system-version") return await systemVersion(req, res);

  // Demais requerem JWT
  const claims = getAuth(req);
  if (!claims) return json(res, 401, { error: "Não autorizado" });

  try {
    if (fnPath === "upload-to-drive" && req.method === "POST") return await uploadToDrive(req, res, claims);
    if (fnPath === "serve-drive-file" && req.method === "POST") return await serveDriveFile(req, res, claims);
    if (fnPath === "delete-from-drive" && req.method === "POST") return await deleteFromDrive(req, res, claims);
    if (fnPath === "validate-license" && req.method === "POST") return await validateLicense(req, res, claims);
    if (fnPath === "license-temp-unlock" && req.method === "POST") return await licenseTempUnlock(req, res, claims);
    if (fnPath === "system-update" && req.method === "POST") return await systemUpdate(req, res, claims);
    return json(res, 404, { error: `Função '${fnPath}' não disponível na instalação local` });
  } catch (e) {
    console.error("[FUNCTION ERROR]", fnPath, e);
    return json(res, 500, { error: e.message || "Erro interno" });
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); json(res, 500, { error: "Internal error" }); });
});
server.listen(PORT, "127.0.0.1", () => console.log(`Functions server running on port ${PORT}`));
FUNCSERVER

  cat > /etc/systemd/system/axisdocs-functions.service <<EOF_FUNC
[Unit]
Description=AxisDocs Local Functions Server
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/axisdocs-functions/server.js
Restart=always
RestartSec=5
Environment=JWT_SECRET=$JWT_SECRET
Environment=DATABASE_URL=postgres://$PG_USER:$PG_PASS@localhost:5432/$PG_DB
WorkingDirectory=/opt/axisdocs-functions

[Install]
WantedBy=multi-user.target
EOF_FUNC

  systemctl daemon-reload
  systemctl enable axisdocs-functions
  systemctl restart axisdocs-functions

  success "Servidor de funções locais rodando na porta 5556"
}

install_ssl_packages() {
  if [ -z "$APP_DOMAIN" ]; then
    return
  fi

  log "Instalando pacotes de SSL"
  apt_install certbot python3-certbot-nginx
  success "Pacotes de SSL instalados"
}

clean_previous() {
  # Para serviços anteriores
  systemctl stop axisdocs-auth 2>/dev/null || true
  systemctl stop axisdocs-storage 2>/dev/null || true
  systemctl stop axisdocs-functions 2>/dev/null || true
  systemctl stop postgrest 2>/dev/null || true

  if [ -d "$APP_DIR" ]; then
    log "Removendo instalação anterior em $APP_DIR"
    rm -rf "$APP_DIR"
    success "Instalação anterior removida"
  fi

  rm -f /etc/nginx/sites-enabled/axisdocs
  rm -f /etc/nginx/sites-available/axisdocs
  rm -f /etc/nginx/sites-enabled/default
  rm -f /etc/nginx/sites-available/default
}

prepare_app_files() {
  log "Copiando arquivos locais da aplicação"
  mkdir -p "$APP_DIR"

  tar \
    --exclude='./.git' \
    --exclude='./node_modules' \
    --exclude='./dist' \
    --exclude='./remotion/node_modules' \
    -cf - -C "$SOURCE_DIR" . | tar -xf - -C "$APP_DIR"

  success "Arquivos locais copiados para $APP_DIR"
}

write_env_file() {
  log "Gerando arquivo .env para esta instalação"

  # A API fica acessível via Nginx na mesma origem
  local api_base
  if [ -n "$APP_DOMAIN" ]; then
    if [ "$SSL_CONFIGURED" = "true" ]; then
      api_base="https://$APP_DOMAIN"
    else
      api_base="http://$APP_DOMAIN"
    fi
  else
    api_base="http://$SERVER_HOST"
  fi

  cat > "$APP_DIR/.env" <<EOF_ENV
VITE_SUPABASE_URL=${api_base}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=local
EOF_ENV

  success "Arquivo .env gerado"
}

build_frontend() {
  log "Instalando dependências do projeto"
  cd "$APP_DIR"
  npm install --no-fund --no-audit

  log "Gerando build de produção"
  npm run build

  if [ ! -f "$APP_DIR/dist/index.html" ]; then
    fail "O build não gerou o arquivo dist/index.html"
  fi

  success "Frontend compilado"
}

configure_nginx() {
  local listen_ipv4 listen_ipv6 server_name

  log "Configurando Nginx como gateway"

  rm -f /etc/nginx/sites-enabled/default
  rm -f /etc/nginx/sites-available/default
  rm -f /etc/nginx/conf.d/default.conf
  rm -f /etc/nginx/conf.d/default

  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

  if [ -n "$APP_DOMAIN" ]; then
    listen_ipv4="listen 80;"
    listen_ipv6="listen [::]:80;"
    server_name="$APP_DOMAIN"
  else
    listen_ipv4="listen 80 default_server;"
    listen_ipv6="listen [::]:80 default_server;"
    server_name="_"
  fi

  # Zonas de rate-limit (devem ficar no contexto http via conf.d)
  cat > /etc/nginx/conf.d/axisdocs-limits.conf <<'EOF_LIMITS'
limit_req_zone $binary_remote_addr zone=axisdocs_auth:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=axisdocs_api:10m rate=30r/s;
server_tokens off;
EOF_LIMITS

  cat > /etc/nginx/sites-available/axisdocs <<EOF_NGINX
server {
    $listen_ipv4
    $listen_ipv6
    server_name $server_name;

    root $APP_DIR/dist;
    index index.html;
    client_max_body_size 100M;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
    gzip_min_length 256;

    # ===== Security headers (aplicados a todas as respostas) =====
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(self), microphone=(), geolocation=()" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: data:; connect-src 'self' https: wss:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" always;

    # PostgREST API
    location /rest/v1/ {
        limit_req zone=axisdocs_api burst=60 nodelay;
        proxy_pass http://127.0.0.1:3001/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Auth API (rate-limit estrito p/ brute-force)
    location /auth/v1/ {
        limit_req zone=axisdocs_auth burst=10 nodelay;
        proxy_pass http://127.0.0.1:9999/auth/v1/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Storage API — CORS restrito ao próprio host
    location /storage/v1/ {
        limit_req zone=axisdocs_api burst=60 nodelay;
        proxy_pass http://127.0.0.1:5555/storage/v1/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_hide_header Access-Control-Allow-Origin;
        add_header Access-Control-Allow-Origin "\$scheme://\$host" always;
        add_header Access-Control-Allow-Credentials "true" always;
    }

    # Local Functions API
    location /functions/v1/ {
        limit_req zone=axisdocs_api burst=60 nodelay;
        proxy_pass http://127.0.0.1:5556/functions/v1/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        client_max_body_size 100M;
        proxy_hide_header Access-Control-Allow-Origin;
        add_header Access-Control-Allow-Origin "\$scheme://\$host" always;
        add_header Access-Control-Allow-Credentials "true" always;
    }

    # License server proxy dinâmico
    location ~ ^/license-proxy/([^/]+)(/.*)?$ {
        resolver 8.8.8.8 1.1.1.1 ipv6=off valid=300s;
        resolver_timeout 5s;
        set \$lic_host \$1;
        set \$lic_path \$2;
        if (\$lic_path = "") { set \$lic_path "/"; }
        proxy_pass https://\$lic_host\$lic_path\$is_args\$args;
        proxy_ssl_server_name on;
        proxy_ssl_name \$lic_host;
        proxy_set_header Host \$lic_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 15s;
        add_header Access-Control-Allow-Origin "\$scheme://\$host" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
        if (\$request_method = OPTIONS) { return 204; }
    }

    # Frontend SPA
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }
}
EOF_NGINX

  ln -sfn /etc/nginx/sites-available/axisdocs /etc/nginx/sites-enabled/axisdocs

  if ! grep -q "include /etc/nginx/sites-enabled" /etc/nginx/nginx.conf 2>/dev/null; then
    sed -i '/http {/a \    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
  fi

  nginx -t
  systemctl restart nginx
  success "Nginx configurado como gateway API"
}

enable_ssl() {
  if [ -z "$APP_DOMAIN" ]; then
    return
  fi

  log "Emitindo certificado SSL para $APP_DOMAIN"

  if certbot --nginx --non-interactive --agree-tos --redirect -m "$SSL_EMAIL" -d "$APP_DOMAIN"; then
    SSL_CONFIGURED="true"
    success "SSL configurado com sucesso"
    write_env_file
    build_frontend
    return
  fi

  # Se falhou mas já existe certificado válido (rate limit), reutiliza
  if [ -f "/etc/letsencrypt/live/$APP_DOMAIN/fullchain.pem" ]; then
    echo "⚠️  Não foi possível emitir novo certificado (possível rate limit), mas certificado existente será usado."
    SSL_CONFIGURED="true"
    write_env_file
    build_frontend
    return
  fi

  echo "⚠️  Falha ao configurar SSL. O sistema continuará via HTTP."
  echo "   Tente novamente mais tarde com: sudo certbot --nginx -d $APP_DOMAIN"
}

write_credentials_file() {
  cat > /etc/axisdocs/credentials <<EOF_CRED
# AxisDocs - Credenciais locais (MANTENHA SEGURO)
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_KEY=$SERVICE_KEY
PG_USER=$PG_USER
PG_PASS=$PG_PASS
PG_DB=$PG_DB
APP_DOMAIN=$APP_DOMAIN
EOF_CRED
  chmod 600 /etc/axisdocs/credentials
  success "Credenciais salvas em /etc/axisdocs/credentials"
}

write_update_script() {
cat > "$APP_DIR/update.sh" <<'EOF_UPDATE'
#!/bin/bash
set -euo pipefail

APP_DIR="/opt/axisdocs"
CRED_FILE="/etc/axisdocs/credentials"
REPO_URL="${AXISDOCS_REPO_URL:-https://github.com/danielnwmt/axis-docs.git}"
REPO_BRANCH="${AXISDOCS_REPO_BRANCH:-main}"
LOG_FILE="/var/log/axisdocs-update.log"

mkdir -p "$(dirname "$LOG_FILE")"
exec >>"$LOG_FILE" 2>&1
echo "===== $(date '+%F %T') Iniciando atualização ====="

if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash update.sh"
  exit 1
fi

if [ ! -f "$CRED_FILE" ]; then
  echo "❌ Arquivo de credenciais não encontrado: $CRED_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$CRED_FILE"

if ! command -v git >/dev/null 2>&1; then
  apt-get update -qq && apt-get install -y -qq git
fi

# Sincroniza o código com o repositório Git oficial
if [ -d "$APP_DIR/.git" ]; then
  echo "➡️  git fetch + reset em $APP_DIR (branch $REPO_BRANCH)"
  cd "$APP_DIR"
  git fetch --depth 1 origin "$REPO_BRANCH"
  git reset --hard "origin/$REPO_BRANCH"
  git clean -fd -e .env -e node_modules -e dist
else
  echo "➡️  Clonando $REPO_URL ($REPO_BRANCH) em $APP_DIR"
  # Preserva .env e arquivos sensíveis
  TMP_BACKUP="$(mktemp -d)"
  [ -f "$APP_DIR/.env" ] && cp "$APP_DIR/.env" "$TMP_BACKUP/.env" || true
  rm -rf "$APP_DIR.old" || true
  if [ -d "$APP_DIR" ]; then mv "$APP_DIR" "$APP_DIR.old"; fi
  git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
  [ -f "$TMP_BACKUP/.env" ] && cp "$TMP_BACKUP/.env" "$APP_DIR/.env" || true
  rm -rf "$TMP_BACKUP"
fi

# Determina URL da API local
if [ -n "${APP_DOMAIN:-}" ]; then
  if [ -d /etc/letsencrypt/live/"$APP_DOMAIN" ]; then
    API_BASE="https://$APP_DOMAIN"
  else
    API_BASE="http://$APP_DOMAIN"
  fi
else
  API_BASE="http://$(hostname -I | awk '{print $1}')"
fi

echo "➡️  Sobrescrevendo .env para apontar para o banco LOCAL ($API_BASE)"
cat > "$APP_DIR/.env" <<EOF_ENV
VITE_SUPABASE_URL=${API_BASE}
VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
VITE_SUPABASE_PROJECT_ID=local
EOF_ENV
chmod 600 "$APP_DIR/.env"

echo "➡️  Atualizando schema local de licença..."
sudo -u postgres psql -d "$PG_DB" <<'SQL'
CREATE TABLE IF NOT EXISTS public.license_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_url text NOT NULL DEFAULT '',
  license_key text NOT NULL DEFAULT '',
  hardware_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'inactive',
  customer_name text DEFAULT '',
  expires_at timestamptz,
  message text DEFAULT '',
  last_check timestamptz,
  temp_unlock_until timestamptz,
  last_temp_unlock_at timestamptz,
  storage_limit_gb numeric NOT NULL DEFAULT 0,
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS last_temp_unlock_at timestamptz;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS storage_limit_gb numeric NOT NULL DEFAULT 0;
ALTER TABLE public.license_config ADD COLUMN IF NOT EXISTS storage_used_bytes bigint NOT NULL DEFAULT 0;
ALTER TABLE public.license_config ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins read license config' AND tablename = 'license_config') THEN
    CREATE POLICY "Admins read license config" ON public.license_config FOR SELECT TO authenticated USING (has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins insert license config' AND tablename = 'license_config') THEN
    CREATE POLICY "Admins insert license config" ON public.license_config FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'Administrador'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins update license config' AND tablename = 'license_config') THEN
    CREATE POLICY "Admins update license config" ON public.license_config FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'Administrador'));
  END IF;
END $$;
SQL
systemctl restart postgrest 2>/dev/null || true

echo "➡️  Reconstruindo AxisDocs..."
cd "$APP_DIR"
npm install --no-fund --no-audit
npm run build

# Grava arquivo VERSION com commit + data
COMMIT_HASH="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$APP_DIR/VERSION" <<EOF_VER
COMMIT=$COMMIT_HASH
BUILT_AT=$BUILT_AT
BRANCH=$REPO_BRANCH
EOF_VER

if grep -rq "supabase.co" "$APP_DIR/dist/" 2>/dev/null; then
  echo "⚠️  AVISO: ainda há referências a supabase.co em dist/."
  grep -rl "supabase.co" "$APP_DIR/dist/" | head
else
  echo "✅ Build limpo — sem referências à Lovable Cloud."
fi

systemctl restart axisdocs-functions 2>/dev/null || true
nginx -t
systemctl reload nginx
echo "✅ Atualização concluída ($COMMIT_HASH @ $BUILT_AT)"
EOF_UPDATE

  chmod +x "$APP_DIR/update.sh"
}

write_uninstall_script() {
  cat > "$APP_DIR/uninstall.sh" <<'EOF_UNINSTALL'
#!/bin/bash
set -euo pipefail

APP_DIR="/opt/axisdocs"

if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash uninstall.sh"
  exit 1
fi

echo "➡️  Removendo AxisDocs..."

systemctl stop axisdocs-auth 2>/dev/null || true
systemctl stop axisdocs-storage 2>/dev/null || true
systemctl stop axisdocs-functions 2>/dev/null || true
systemctl stop postgrest 2>/dev/null || true
systemctl disable axisdocs-auth 2>/dev/null || true
systemctl disable axisdocs-storage 2>/dev/null || true
systemctl disable axisdocs-functions 2>/dev/null || true
systemctl disable postgrest 2>/dev/null || true

rm -f /etc/systemd/system/axisdocs-auth.service
rm -f /etc/systemd/system/axisdocs-storage.service
rm -f /etc/systemd/system/axisdocs-functions.service
rm -f /etc/systemd/system/postgrest.service
systemctl daemon-reload

rm -f /etc/nginx/sites-enabled/axisdocs
rm -f /etc/nginx/sites-available/axisdocs
nginx -t >/dev/null 2>&1 && systemctl restart nginx || true

rm -rf "$APP_DIR"
rm -rf /opt/axisdocs-auth
rm -rf /opt/axisdocs-storage
rm -rf /opt/axisdocs-functions
rm -rf /etc/axisdocs
rm -rf /var/lib/axisdocs

echo "⚠️  O banco PostgreSQL 'axisdocs' NÃO foi removido."
echo "   Para remover: sudo -u postgres psql -c \"DROP DATABASE axisdocs;\""
echo "✅ AxisDocs removido!"
echo "ℹ️  Nginx, Node.js e PostgreSQL continuam instalados."
EOF_UNINSTALL

  chmod +x "$APP_DIR/uninstall.sh"
}

write_backup_script() {
  # Gera passphrase persistente p/ cifrar backups (somente root lê)
  if [ ! -f /etc/axisdocs/backup.key ]; then
    mkdir -p /etc/axisdocs
    openssl rand -base64 48 > /etc/axisdocs/backup.key
    chmod 600 /etc/axisdocs/backup.key
  fi

  # gpg é necessário p/ cifrar
  command -v gpg >/dev/null 2>&1 || apt_install gnupg

  cat > "$APP_DIR/backup.sh" <<'EOF_BACKUP'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/var/backups/axisdocs"
DATE=$(date +%Y%m%d_%H%M%S)
KEY_FILE="/etc/axisdocs/backup.key"

if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash backup.sh"
  exit 1
fi

if [ ! -f "$KEY_FILE" ]; then
  echo "❌ Chave de backup não encontrada em $KEY_FILE"
  exit 1
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Antivírus: escaneia o storage antes de cifrar (não bloqueia se clamav não estiver instalado)
if command -v clamdscan >/dev/null 2>&1; then
  echo "➡️  Escaneando storage com ClamAV..."
  if ! clamdscan --fdpass --quiet /var/lib/axisdocs/storage; then
    echo "❌ ClamAV detectou ameaças no storage. Backup abortado."
    exit 2
  fi
fi

echo "➡️  Backup do banco (cifrado AES-256)..."
sudo -u postgres pg_dump axisdocs \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "$KEY_FILE" \
        -o "$BACKUP_DIR/db_$DATE.sql.gpg"

echo "➡️  Backup dos arquivos (cifrado AES-256)..."
tar -czf - -C /var/lib/axisdocs storage/ \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-file "$KEY_FILE" \
        -o "$BACKUP_DIR/storage_$DATE.tar.gz.gpg"

chmod 600 "$BACKUP_DIR/"*"$DATE"*
echo "✅ Backup cifrado em $BACKUP_DIR/"
echo "ℹ️  Para restaurar: gpg --decrypt --passphrase-file $KEY_FILE <arquivo.gpg>"
ls -lh "$BACKUP_DIR/"*"$DATE"*
EOF_BACKUP

  chmod +x "$APP_DIR/backup.sh"
}

configure_fail2ban() {
  log "Configurando fail2ban (SSH + Nginx)"

  cat > /etc/fail2ban/jail.d/axisdocs.conf <<'EOF_F2B'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
port     = http,https
logpath  = /var/log/nginx/error.log
maxretry = 10
EOF_F2B

  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban || true
  success "fail2ban ativo"
}

configure_clamav() {
  log "Instalando e configurando ClamAV (antivírus)"
  apt_install clamav clamav-daemon clamav-freshclam

  # Atualiza base de assinaturas antes de iniciar o daemon
  systemctl stop clamav-freshclam >/dev/null 2>&1 || true
  freshclam || warn "freshclam falhou (sem internet?). O daemon usará base vazia até a próxima atualização."
  systemctl enable clamav-freshclam clamav-daemon >/dev/null 2>&1 || true
  systemctl restart clamav-freshclam || true
  systemctl restart clamav-daemon || true

  # Script utilitário p/ escanear o diretório de storage
  cat > /usr/local/bin/axisdocs-scan.sh <<'EOF_SCAN'
#!/bin/bash
# Uso: axisdocs-scan.sh <caminho>
# Retorna 0 se limpo, 1 se infectado, 2 se erro
set -u
TARGET="${1:-/var/lib/axisdocs/storage}"
if ! command -v clamdscan >/dev/null 2>&1; then
  echo "clamdscan não disponível" >&2; exit 2
fi
clamdscan --fdpass --quiet "$TARGET"
EOF_SCAN
  chmod +x /usr/local/bin/axisdocs-scan.sh
  success "ClamAV ativo (use: axisdocs-scan.sh <caminho>)"
}

verify_installation() {
  log "Validando serviços"

  # Verifica PostgREST (401 é resposta válida — significa que está rodando)
  local postgrest_ok=false
  for _ in $(seq 1 10); do
    if curl -sI http://127.0.0.1:3001/ 2>/dev/null | head -1 | grep -q "HTTP"; then
      postgrest_ok=true; break
    fi
    sleep 1
  done
  if [ "$postgrest_ok" = true ]; then success "PostgREST respondendo"; else fail "PostgREST não respondeu"; fi

  # Verifica Auth (404 é resposta válida — significa que está rodando)
  local auth_ok=false
  for _ in $(seq 1 10); do
    if curl -sI http://127.0.0.1:9999/auth/v1/user 2>/dev/null | head -1 | grep -q "HTTP"; then
      auth_ok=true; break
    fi
    sleep 1
  done
  if [ "$auth_ok" = true ]; then success "Auth respondendo"; else fail "Auth não respondeu"; fi

  # Verifica Nginx
  local nginx_ok=false
  for _ in $(seq 1 15); do
    if curl -sI http://127.0.0.1/ 2>/dev/null | head -1 | grep -q "HTTP"; then
      nginx_ok=true; break
    fi
    sleep 1
  done
  if [ "$nginx_ok" = true ]; then success "Aplicação respondendo localmente"; else fail "A aplicação não respondeu corretamente após a instalação"; fi
}

print_success() {
  local access_url

  if [ "$SSL_CONFIGURED" = "true" ]; then
    access_url="https://$SERVER_HOST"
  else
    access_url="http://$SERVER_HOST"
  fi

  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║   ✅ Instalação concluída!                   ║"
  echo "╠══════════════════════════════════════════════╣"
  echo "║                                              ║"
  echo "║  🌐 Acesse: $access_url"
  echo "║                                              ║"
  echo "║  Serviços locais:                            ║"
  echo "║  • PostgreSQL (porta 5432)                   ║"
  echo "║  • PostgREST  (porta 3001)                   ║"
  echo "║  • Auth       (porta 9999)                   ║"
  echo "║  • Storage    (porta 5555)                   ║"
  echo "║  • Nginx      (porta 80/443)                 ║"
  echo "║                                              ║"
  echo "║  Comandos úteis:                             ║"
  echo "║  sudo bash $APP_DIR/update.sh"
  echo "║  sudo bash $APP_DIR/backup.sh"
  echo "║  sudo bash $APP_DIR/uninstall.sh"
  echo "║                                              ║"
  echo "║  Credenciais: /etc/axisdocs/credentials      ║"
  echo "║                                              ║"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
}

main_install() {
  print_header
  require_root
  validate_source_dir
  collect_install_options
  clean_previous
  install_base_packages
  install_nodejs
  install_postgresql
  generate_jwt_keys
  setup_application_database
  install_postgrest
  create_admin_user
  install_auth_server
  install_storage_server
  install_local_functions
  install_ssl_packages
  prepare_app_files
  write_env_file
  build_frontend
  configure_nginx
  enable_ssl
  write_credentials_file
  write_update_script
  write_uninstall_script
  write_backup_script
  configure_fail2ban
  configure_clamav
  verify_installation
  print_success
}
