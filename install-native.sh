#!/bin/bash
set -e

APP_DIR="/opt/axisdocs"
REPO_URL="https://github.com/danielnwmt/axis-docs.git"
DB_NAME="axisdocs"
DB_USER="axisdocs"
NODE_VERSION="20"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   AXIS DOCS - Instalação Nativa Ubuntu   ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Root check
if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash install-native.sh"
  exit 1
fi

# 1. Update system
echo "📦 Atualizando pacotes do sistema..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git openssl lsb-release wget

# 2. Install PostgreSQL 16
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

# 3. Install Node.js
if ! command -v node &>/dev/null; then
  echo "📗 Instalando Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
  echo "✅ Node.js $(node -v) instalado"
else
  echo "✅ Node.js $(node -v) já instalado"
fi

# 4. Install Nginx
if ! command -v nginx &>/dev/null; then
  echo "🌐 Instalando Nginx..."
  apt-get install -y -qq nginx
  systemctl enable nginx
  echo "✅ Nginx instalado"
else
  echo "✅ Nginx já instalado"
fi

# 5. Clone or update repo
if [ -d "$APP_DIR" ]; then
  echo "🔄 Atualizando repositório..."
  cd "$APP_DIR"
  git pull origin main || git pull origin master
else
  echo "📥 Clonando repositório..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 6. Ask for server host
echo ""
LOCAL_IP=$(hostname -I | awk '{print $1}')
read -p "🌐 Hostname ou IP do servidor [$LOCAL_IP]: " SERVER_HOST
SERVER_HOST=${SERVER_HOST:-$LOCAL_IP}

# 7. Generate secrets
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

# 8. Setup PostgreSQL database and user
echo ""
echo "🐘 Configurando banco de dados..."

sudo -u postgres psql -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"

sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

# Create extensions and tables
sudo -u postgres psql -d "$DB_NAME" <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'Usuário',
  unit text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
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
  file_size bigint DEFAULT 0,
  file_type text DEFAULT '',
  ocr_status text NOT NULL DEFAULT 'pendente',
  ocr_text text DEFAULT '',
  sign_status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL DEFAULT '',
  action text NOT NULL,
  action_type text NOT NULL DEFAULT 'other',
  target text NOT NULL DEFAULT '',
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
SQL

echo "✅ Banco de dados configurado"

# 9. Install Supabase CLI tools (GoTrue + PostgREST + Storage)
echo ""
echo "📦 Instalando serviços backend..."

GOTRUE_VERSION="v2.164.0"
POSTGREST_VERSION="v12.2.3"

# GoTrue (Auth)
if [ ! -f /usr/local/bin/gotrue ]; then
  echo "  → Baixando GoTrue..."
  wget -q "https://github.com/supabase/gotrue/releases/download/${GOTRUE_VERSION}/gotrue-${GOTRUE_VERSION}-linux-amd64.tar.gz" -O /tmp/gotrue.tar.gz
  tar -xzf /tmp/gotrue.tar.gz -C /tmp/
  mv /tmp/gotrue /usr/local/bin/gotrue
  chmod +x /usr/local/bin/gotrue
  rm -f /tmp/gotrue.tar.gz
  echo "  ✅ GoTrue instalado"
fi

# PostgREST
if [ ! -f /usr/local/bin/postgrest ]; then
  echo "  → Baixando PostgREST..."
  wget -q "https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x86_64.tar.xz" -O /tmp/postgrest.tar.xz
  tar -xJf /tmp/postgrest.tar.xz -C /tmp/
  mv /tmp/postgrest /usr/local/bin/postgrest
  chmod +x /usr/local/bin/postgrest
  rm -f /tmp/postgrest.tar.xz
  echo "  ✅ PostgREST instalado"
fi

# Storage directory
mkdir -p /var/lib/axisdocs/storage/documents
mkdir -p /var/lib/axisdocs/storage/settings
chown -R www-data:www-data /var/lib/axisdocs/storage

# 10. Write .env
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

# 11. Create systemd services

# GoTrue service
cat > /etc/systemd/system/axisdocs-auth.service <<EOF
[Unit]
Description=AxisDocs Auth (GoTrue)
After=postgresql.service
Requires=postgresql.service

[Service]
Type=simple
Environment=GOTRUE_DB_DRIVER=postgres
Environment=GOTRUE_DB_DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME
Environment=GOTRUE_JWT_SECRET=$JWT_SECRET
Environment=GOTRUE_JWT_EXP=3600
Environment=GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
Environment=GOTRUE_SITE_URL=http://$SERVER_HOST
Environment=API_EXTERNAL_URL=http://$SERVER_HOST/auth/v1
Environment=GOTRUE_API_HOST=0.0.0.0
Environment=PORT=9999
Environment=GOTRUE_DISABLE_SIGNUP=false
Environment=GOTRUE_EXTERNAL_EMAIL_ENABLED=true
Environment=GOTRUE_MAILER_AUTOCONFIRM=true
ExecStart=/usr/local/bin/gotrue
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# PostgREST config
cat > /etc/axisdocs-postgrest.conf <<EOF
db-uri = "postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "0.0.0.0"
server-port = 3000
EOF

# PostgREST service
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

# 12. Build frontend
echo ""
echo "🔨 Compilando frontend..."
cd "$APP_DIR"
npm install
npm run build
echo "✅ Frontend compilado"

# 13. Configure Nginx
cat > /etc/nginx/sites-available/axisdocs <<EOF
server {
    listen 80;
    server_name $SERVER_HOST;

    root $APP_DIR/dist;
    index index.html;

    # Frontend SPA
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Auth API
    location /auth/v1/ {
        proxy_pass http://127.0.0.1:9999/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # REST API
    location /rest/v1/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static storage
    location /storage/v1/object/public/ {
        alias /var/lib/axisdocs/storage/;
        autoindex off;
    }
}
EOF

ln -sf /etc/nginx/sites-available/axisdocs /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl restart nginx
echo "✅ Nginx configurado"

# 14. Create PostgreSQL roles for PostgREST
sudo -u postgres psql -d "$DB_NAME" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END\$\$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

GRANT $DB_USER TO anon, authenticated, service_role;
SQL

echo "✅ Roles PostgreSQL criadas"

# 15. Start services
echo ""
echo "🚀 Iniciando serviços..."
systemctl daemon-reload
systemctl enable axisdocs-auth axisdocs-api
systemctl start axisdocs-auth axisdocs-api

# Wait for services
echo "⏳ Aguardando serviços..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:9999/health > /dev/null 2>&1; then
    echo "✅ Auth pronto"
    break
  fi
  [ "$i" = "30" ] && echo "⚠️  Auth timeout"
  sleep 2
done

# 16. Create admin user
echo ""
echo "👤 Criando usuário administrador..."

ADMIN_RESPONSE=$(curl -s -X POST "http://localhost:9999/admin/users" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@axis.com","password":"admin123","email_confirm":true}' 2>/dev/null || echo "{}")

ADMIN_ID=$(echo "$ADMIN_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$ADMIN_ID" ]; then
  echo "✅ Usuário admin criado"
  sudo -u postgres psql -d "$DB_NAME" -c \
    "INSERT INTO profiles (id, email, role, unit) VALUES ('$ADMIN_ID', 'admin@axis.com', 'Administrador', '') ON CONFLICT (id) DO NOTHING;"
  echo "✅ Perfil administrador criado"
else
  echo "⚠️  Erro ao criar admin (pode já existir): $ADMIN_RESPONSE"
fi

# 17. Create uninstall script
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

rm -rf /var/lib/axisdocs
rm -rf /opt/axisdocs

echo "✅ AxisDocs removido com sucesso!"
echo "ℹ️  PostgreSQL, Node.js e Nginx continuam instalados."
echo "   Para removê-los: apt remove postgresql-16 nodejs nginx"
UNINSTALL
chmod +x "$APP_DIR/uninstall.sh"

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
echo "Para desinstalar:"
echo "  sudo bash $APP_DIR/uninstall.sh"
echo ""
