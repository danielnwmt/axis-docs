#!/bin/bash
set -e

APP_DIR="/opt/axisdocs"
REPO_URL="https://github.com/danielnwmt/axis-docs.git"
DB_NAME="axisdocs"
DB_USER="axisdocs"
NODE_VERSION="20"
GOTRUE_VERSION="v2.164.0"
POSTGREST_VERSION="v12.2.3"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   AXIS DOCS - Instalação Ubuntu          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Root check
if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash install.sh"
  exit 1
fi

# ============================================================
# 1. Install dependencies
# ============================================================
echo "📦 Atualizando pacotes do sistema..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git openssl lsb-release wget xz-utils

# PostgreSQL 16
if ! command -v psql &>/dev/null; then
  echo "🐘 Instalando PostgreSQL 16..."
  sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
  wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
  apt-get update -qq
  apt-get install -y -qq postgresql-16 postgresql-contrib-16
  systemctl enable postgresql
  systemctl start postgresql
  echo "✅ PostgreSQL 16 instalado"
else
  echo "✅ PostgreSQL já instalado"
fi

# Node.js
if ! command -v node &>/dev/null; then
  echo "📗 Instalando Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
  echo "✅ Node.js $(node -v) instalado"
else
  echo "✅ Node.js $(node -v) já instalado"
fi

# Nginx
if ! command -v nginx &>/dev/null; then
  echo "🌐 Instalando Nginx..."
  apt-get install -y -qq nginx
  systemctl enable nginx
  echo "✅ Nginx instalado"
else
  echo "✅ Nginx já instalado"
fi

# ============================================================
# 2. Clone or update repo
# ============================================================
if [ -d "$APP_DIR" ]; then
  echo "🔄 Atualizando repositório..."
  cd "$APP_DIR"
  git pull origin main || git pull origin master || true
else
  echo "📥 Clonando repositório..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ============================================================
# 3. Server host
# ============================================================
echo ""
LOCAL_IP=$(hostname -I | awk '{print $1}')
read -p "🌐 Hostname ou IP do servidor [$LOCAL_IP]: " SERVER_HOST
SERVER_HOST=${SERVER_HOST:-$LOCAL_IP}

# ============================================================
# 4. Generate secrets
# ============================================================
echo ""
echo "🔐 Gerando chaves de segurança..."

DB_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 20)
JWT_SECRET=$(openssl rand -base64 32)

generate_jwt() {
  local role=$1
  local secret=$2
  local header payload signature now exp
  header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  now=$(date +%s)
  exp=$((now + 315360000))
  payload=$(echo -n "{\"role\":\"$role\",\"iss\":\"supabase\",\"iat\":$now,\"exp\":$exp}" | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  signature=$(echo -n "$header.$payload" | openssl dgst -sha256 -hmac "$secret" -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  echo "$header.$payload.$signature"
}

ANON_KEY=$(generate_jwt "anon" "$JWT_SECRET")
SERVICE_ROLE_KEY=$(generate_jwt "service_role" "$JWT_SECRET")
echo "✅ Chaves geradas"

# ============================================================
# 5. Setup PostgreSQL database
# ============================================================
echo ""
echo "🐘 Configurando banco de dados..."

# Create main DB user and database
sudo -u postgres psql <<EOSQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
  ELSE
    ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
  END IF;
END\$\$;

SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME');
EOSQL

# Create database if not exists
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# Setup roles, schemas, tables, RLS
sudo -u postgres psql -d "$DB_NAME" <<EOSQL
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;

-- Roles for PostgREST / GoTrue
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN PASSWORD '$DB_PASSWORD' NOINHERIT;
  ELSE
    ALTER ROLE authenticator WITH PASSWORD '$DB_PASSWORD';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin LOGIN PASSWORD '$DB_PASSWORD' NOINHERIT CREATEROLE CREATEDB;
  ELSE
    ALTER ROLE supabase_auth_admin WITH PASSWORD '$DB_PASSWORD';
  END IF;
END\$\$;

-- Role grants
GRANT anon TO authenticator;
GRANT authenticated TO authenticator;
GRANT service_role TO authenticator;
GRANT supabase_auth_admin TO postgres;
GRANT $DB_USER TO authenticator;

-- Schema access
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Auth schema (GoTrue creates its tables here)
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION supabase_auth_admin;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role, postgres;

-- ========================================
-- Auth helper functions (for RLS)
-- ========================================
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
\$\$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'role', '')::text
\$\$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql STABLE
AS \$\$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::json->>'email', '')::text
\$\$;

-- ========================================
-- Application tables
-- ========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  role text NOT NULL DEFAULT 'Usuário',
  unit text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.documents (
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

CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS \$\$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = _role
  )
\$\$;

CREATE OR REPLACE FUNCTION public.insert_audit_log(
  _action text,
  _action_type text DEFAULT 'other',
  _target text DEFAULT '',
  _details text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS \$\$
DECLARE
  _user_id uuid;
  _user_email text;
BEGIN
  _user_id := auth.uid();
  _user_email := auth.email();
  INSERT INTO public.audit_logs (user_id, user_email, action, action_type, target, details)
  VALUES (_user_id, COALESCE(_user_email, ''), _action, _action_type, _target, _details);
END;
\$\$;

CREATE OR REPLACE FUNCTION public.prevent_role_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS \$\$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT has_role(auth.uid(), 'Administrador') THEN
      RAISE EXCEPTION 'Only administrators can change user roles';
    END IF;
  END IF;
  RETURN NEW;
END;
\$\$;

DROP TRIGGER IF EXISTS enforce_role_change ON public.profiles;
CREATE TRIGGER enforce_role_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_change();

-- ========================================
-- RLS Policies (use DROP IF EXISTS + CREATE)
-- ========================================

-- profiles
DROP POLICY IF EXISTS "Users can read own profile or admin reads all" ON public.profiles;
CREATE POLICY "Users can read own profile or admin reads all" ON public.profiles
  FOR SELECT TO authenticated
  USING ((auth.uid() = id) OR has_role(auth.uid(), 'Administrador'));

DROP POLICY IF EXISTS "Users can update own profile safely" ON public.profiles;
CREATE POLICY "Users can update own profile safely" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK ((auth.uid() = id) AND (role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())));

DROP POLICY IF EXISTS "Users can insert own profile with default role" ON public.profiles;
CREATE POLICY "Users can insert own profile with default role" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = id) AND (role = 'Usuário'));

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'))
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

-- documents
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;
CREATE POLICY "Authenticated users can insert documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents" ON public.documents
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own or admin reads all documents" ON public.documents;
CREATE POLICY "Users read own or admin reads all documents" ON public.documents
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR has_role(auth.uid(), 'Administrador'));

-- categories
DROP POLICY IF EXISTS "Authenticated users can read categories" ON public.categories;
CREATE POLICY "Authenticated users can read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert categories" ON public.categories;
CREATE POLICY "Admins can insert categories" ON public.categories
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

DROP POLICY IF EXISTS "Admins can update categories" ON public.categories;
CREATE POLICY "Admins can update categories" ON public.categories
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

DROP POLICY IF EXISTS "Admins can delete categories" ON public.categories;
CREATE POLICY "Admins can delete categories" ON public.categories
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

-- units
DROP POLICY IF EXISTS "Authenticated users can read units" ON public.units;
CREATE POLICY "Authenticated users can read units" ON public.units
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can insert units" ON public.units;
CREATE POLICY "Admins can insert units" ON public.units
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'Administrador'));

DROP POLICY IF EXISTS "Admins can update units" ON public.units;
CREATE POLICY "Admins can update units" ON public.units
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

DROP POLICY IF EXISTS "Admins can delete units" ON public.units;
CREATE POLICY "Admins can delete units" ON public.units
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'Administrador'));

-- audit_logs
DROP POLICY IF EXISTS "Users read own or admin reads all audit logs" ON public.audit_logs;
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

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
EOSQL

echo "✅ Banco de dados configurado"

# ============================================================
# 6. Install GoTrue and PostgREST binaries
# ============================================================
echo ""
echo "📦 Instalando serviços backend..."

if [ ! -f /usr/local/bin/gotrue ]; then
  echo "  → Baixando GoTrue ${GOTRUE_VERSION}..."
  wget -q "https://github.com/supabase/gotrue/releases/download/${GOTRUE_VERSION}/gotrue-${GOTRUE_VERSION}-linux-amd64.tar.gz" -O /tmp/gotrue.tar.gz
  tar -xzf /tmp/gotrue.tar.gz -C /tmp/
  mv /tmp/gotrue /usr/local/bin/gotrue
  chmod +x /usr/local/bin/gotrue
  rm -f /tmp/gotrue.tar.gz
  echo "  ✅ GoTrue instalado"
else
  echo "  ✅ GoTrue já instalado"
fi

if [ ! -f /usr/local/bin/postgrest ]; then
  echo "  → Baixando PostgREST ${POSTGREST_VERSION}..."
  wget -q "https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x86_64.tar.xz" -O /tmp/postgrest.tar.xz
  tar -xJf /tmp/postgrest.tar.xz -C /tmp/
  mv /tmp/postgrest /usr/local/bin/postgrest
  chmod +x /usr/local/bin/postgrest
  rm -f /tmp/postgrest.tar.xz
  echo "  ✅ PostgREST instalado"
else
  echo "  ✅ PostgREST já instalado"
fi

# Storage directories
mkdir -p /var/lib/axisdocs/storage/documents
mkdir -p /var/lib/axisdocs/storage/settings
chown -R www-data:www-data /var/lib/axisdocs/storage

# ============================================================
# 7. Write .env
# ============================================================
cat > "$APP_DIR/.env" <<EOF
SERVER_HOST=$SERVER_HOST
POSTGRES_PASSWORD=$DB_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME
VITE_SUPABASE_URL=http://$SERVER_HOST
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
EOF
echo "✅ Arquivo .env criado"

# ============================================================
# 8. Systemd services
# ============================================================
cat > /etc/systemd/system/axisdocs-auth.service <<EOF
[Unit]
Description=AxisDocs Auth (GoTrue)
After=postgresql.service
Requires=postgresql.service

[Service]
Type=simple
Environment=GOTRUE_DB_DRIVER=postgres
Environment=GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:$DB_PASSWORD@localhost:5432/$DB_NAME
Environment=GOTRUE_JWT_SECRET=$JWT_SECRET
Environment=GOTRUE_JWT_EXP=3600
Environment=GOTRUE_JWT_AUD=authenticated
Environment=GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
Environment=GOTRUE_JWT_ADMIN_ROLES=service_role,supabase_admin
Environment=GOTRUE_SITE_URL=http://$SERVER_HOST
Environment=API_EXTERNAL_URL=http://$SERVER_HOST/auth/v1
Environment=GOTRUE_API_HOST=0.0.0.0
Environment=GOTRUE_API_PORT=9999
Environment=GOTRUE_DISABLE_SIGNUP=false
Environment=GOTRUE_EXTERNAL_EMAIL_ENABLED=true
Environment=GOTRUE_MAILER_AUTOCONFIRM=true
Environment=GOTRUE_EXTERNAL_PHONE_ENABLED=false
Environment=GOTRUE_URI_ALLOW_LIST=*
ExecStart=/usr/local/bin/gotrue
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/axisdocs-postgrest.conf <<EOF
db-uri = "postgresql://authenticator:$DB_PASSWORD@localhost:5432/$DB_NAME"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "0.0.0.0"
server-port = 3000
EOF

cat > /etc/systemd/system/axisdocs-api.service <<EOF
[Unit]
Description=AxisDocs API (PostgREST)
After=postgresql.service
Requires=postgresql.service

[Service]
Type=simple
ExecStart=/usr/local/bin/postgrest /etc/axisdocs-postgrest.conf
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Serviços systemd criados"

# ============================================================
# 9. Build frontend
# ============================================================
echo ""
echo "🔨 Compilando frontend..."
cd "$APP_DIR"
npm install
VITE_SUPABASE_URL="http://$SERVER_HOST" VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY" npm run build
echo "✅ Frontend compilado"

# ============================================================
# 10. Configure Nginx
# ============================================================
cat > /etc/nginx/sites-available/axisdocs <<NGINX
server {
    listen 80;
    server_name $SERVER_HOST _;

    client_max_body_size 100M;

    root $APP_DIR/dist;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;

    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /auth/v1/ {
        proxy_pass http://127.0.0.1:9999/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /rest/v1/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header apikey \$http_apikey;
    }

    location /storage/v1/object/public/ {
        alias /var/lib/axisdocs/storage/;
        autoindex off;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/axisdocs /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
echo "✅ Nginx configurado"

# ============================================================
# 11. Start services
# ============================================================
echo ""
echo "🚀 Iniciando serviços..."
systemctl daemon-reload
systemctl enable axisdocs-auth axisdocs-api
systemctl restart axisdocs-auth axisdocs-api

echo "⏳ Aguardando serviços..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:9999/health > /dev/null 2>&1; then
    echo "✅ Auth pronto"
    break
  fi
  [ "$i" = "30" ] && echo "⚠️  Auth timeout - verifique: journalctl -u axisdocs-auth -f"
  sleep 2
done

sleep 3

# ============================================================
# 12. Create admin user
# ============================================================
echo ""
echo "👤 Criando usuário administrador..."

ADMIN_RESPONSE=$(curl -s -X POST "http://localhost:9999/admin/users" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@axis.com","password":"admin123","email_confirm":true}' 2>/dev/null || echo "{}")

ADMIN_ID=$(echo "$ADMIN_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$ADMIN_ID" ]; then
  echo "✅ Usuário admin criado (ID: $ADMIN_ID)"
  sudo -u postgres psql -d "$DB_NAME" -c \
    "INSERT INTO profiles (id, email, role, unit) VALUES ('$ADMIN_ID', 'admin@axis.com', 'Administrador', '') ON CONFLICT (id) DO NOTHING;"
  echo "✅ Perfil administrador criado"
else
  echo "⚠️  Admin pode já existir: $ADMIN_RESPONSE"
fi

# ============================================================
# 13. Create uninstall script
# ============================================================
cat > "$APP_DIR/uninstall.sh" <<'UNINSTALL'
#!/bin/bash
set -e
if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash uninstall.sh"
  exit 1
fi

echo "🗑️  Removendo AxisDocs..."

systemctl stop axisdocs-auth axisdocs-api 2>/dev/null || true
systemctl disable axisdocs-auth axisdocs-api 2>/dev/null || true
rm -f /etc/systemd/system/axisdocs-auth.service
rm -f /etc/systemd/system/axisdocs-api.service
rm -f /etc/axisdocs-postgrest.conf
systemctl daemon-reload

rm -f /etc/nginx/sites-enabled/axisdocs
rm -f /etc/nginx/sites-available/axisdocs
systemctl restart nginx 2>/dev/null || true

sudo -u postgres psql -c "DROP DATABASE IF EXISTS axisdocs;" 2>/dev/null || true
sudo -u postgres psql -c "DROP USER IF EXISTS axisdocs;" 2>/dev/null || true
sudo -u postgres psql -c "DROP ROLE IF EXISTS authenticator;" 2>/dev/null || true
sudo -u postgres psql -c "DROP ROLE IF EXISTS supabase_auth_admin;" 2>/dev/null || true
sudo -u postgres psql -c "DROP ROLE IF EXISTS anon;" 2>/dev/null || true
sudo -u postgres psql -c "DROP ROLE IF EXISTS authenticated;" 2>/dev/null || true
sudo -u postgres psql -c "DROP ROLE IF EXISTS service_role;" 2>/dev/null || true

rm -rf /var/lib/axisdocs
rm -rf /opt/axisdocs
rm -f /usr/local/bin/gotrue
rm -f /usr/local/bin/postgrest

echo "✅ AxisDocs removido com sucesso!"
echo "ℹ️  PostgreSQL, Node.js e Nginx continuam instalados."
echo "   Para removê-los: apt remove postgresql-16 nodejs nginx"
UNINSTALL
chmod +x "$APP_DIR/uninstall.sh"

# ============================================================
# 14. Create update script
# ============================================================
cat > "$APP_DIR/update.sh" <<UPDATESCRIPT
#!/bin/bash
set -e
if [ "\$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash update.sh"
  exit 1
fi

echo "🔄 Atualizando AxisDocs..."
cd $APP_DIR
git pull origin main || git pull origin master

source $APP_DIR/.env
npm install
VITE_SUPABASE_URL="http://\$SERVER_HOST" VITE_SUPABASE_PUBLISHABLE_KEY="\$ANON_KEY" npm run build

systemctl restart axisdocs-auth axisdocs-api nginx
echo "✅ Atualização concluída!"
UPDATESCRIPT
chmod +x "$APP_DIR/update.sh"

# Done
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅ Instalação concluída!               ║"
echo "╠══════════════════════════════════════════╣"
echo "║                                          ║"
echo "║  🌐 Acesse: http://$SERVER_HOST          "
echo "║                                          ║"
echo "║  👤 Login:                                ║"
echo "║     Email: admin@axis.com                 ║"
echo "║     Senha: admin123                       ║"
echo "║                                          ║"
echo "║  ⚠️  Altere a senha após o 1º login!      ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Comandos úteis:"
echo "  systemctl status axisdocs-auth axisdocs-api"
echo "  systemctl restart axisdocs-auth axisdocs-api"
echo "  journalctl -u axisdocs-auth -f"
echo "  journalctl -u axisdocs-api -f"
echo ""
echo "Para atualizar:"
echo "  sudo bash $APP_DIR/update.sh"
echo ""
echo "Para desinstalar:"
echo "  sudo bash $APP_DIR/uninstall.sh"
echo ""
