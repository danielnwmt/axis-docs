#!/bin/bash
set -e

APP_DIR="/opt/axisdocs"
REPO_URL="https://github.com/danielnwmt/axis-docs.git"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   AXIS DOCS - Instalação Local       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Root check
if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash install.sh"
  exit 1
fi

# 1. Update system
echo "📦 Atualizando pacotes..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git openssl

# 2. Install Docker
if ! command -v docker &>/dev/null; then
  echo "🐳 Instalando Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker && systemctl start docker
  echo "✅ Docker instalado"
else
  echo "✅ Docker já instalado"
fi

# 3. Clone or update repo
if [ -d "$APP_DIR" ]; then
  echo "🔄 Atualizando repositório..."
  cd "$APP_DIR"
  git pull origin main || git pull origin master
else
  echo "📥 Clonando repositório..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 4. Ask for server host
echo ""
LOCAL_IP=$(hostname -I | awk '{print $1}')
read -p "🌐 Hostname ou IP do servidor [$LOCAL_IP]: " SERVER_HOST
SERVER_HOST=${SERVER_HOST:-$LOCAL_IP}

# 5. Generate secrets
echo ""
echo "🔐 Gerando chaves de segurança..."

JWT_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 20)

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

# 6. Write .env
cat > "$APP_DIR/.env" <<EOF
SERVER_HOST=$SERVER_HOST
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
EOF
echo "✅ Arquivo .env criado"

# 7. Make init script executable
chmod +x "$APP_DIR/docker/init/01-setup.sh" 2>/dev/null || true

# 8. Build and start
echo ""
echo "🔨 Construindo e iniciando containers..."
cd "$APP_DIR"
docker compose down -v 2>/dev/null || true
docker compose up -d --build

# 9. Wait for services
echo ""
echo "⏳ Aguardando serviços..."
for i in $(seq 1 60); do
  if curl -sf http://localhost/auth/v1/health > /dev/null 2>&1; then
    echo "✅ Serviços prontos"
    break
  fi
  [ "$i" = "60" ] && echo "⚠️  Timeout. Verifique: docker compose logs"
  sleep 3
done

sleep 5

# 10. Create admin user
echo ""
echo "👤 Criando usuário administrador..."

ADMIN_RESPONSE=$(curl -s -X POST "http://localhost/auth/v1/admin/users" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@axis.com","password":"admin123","email_confirm":true}' 2>/dev/null || echo "{}")

ADMIN_ID=$(echo "$ADMIN_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$ADMIN_ID" ]; then
  echo "✅ Usuário admin criado"
  curl -s -X POST "http://localhost/rest/v1/profiles" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -d "{\"id\":\"$ADMIN_ID\",\"email\":\"admin@axis.com\",\"role\":\"Administrador\",\"unit\":\"\"}" \
    > /dev/null 2>&1
  echo "✅ Perfil administrador criado"
else
  echo "⚠️  Erro ao criar admin: $ADMIN_RESPONSE"
fi

# 11. Create storage buckets
echo ""
echo "📦 Criando buckets..."
curl -s -X POST "http://localhost/storage/v1/bucket" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"documents","name":"documents","public":false}' > /dev/null 2>&1
curl -s -X POST "http://localhost/storage/v1/bucket" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"settings","name":"settings","public":true}' > /dev/null 2>&1
echo "✅ Buckets criados"

# 12. Storage policies
echo "🔒 Configurando políticas de storage..."
sleep 3
docker exec -i axisdocs-db psql -U postgres -d axisdocs <<'SQL' 2>/dev/null || true
CREATE POLICY "Auth upload documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documents');
CREATE POLICY "Auth read documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Auth update documents" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Auth delete documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documents');
CREATE POLICY "Anyone read settings" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'settings');
CREATE POLICY "Auth upload settings" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'settings');
CREATE POLICY "Auth update settings" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'settings');
CREATE POLICY "Auth delete settings" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'settings');
SQL
echo "✅ Políticas configuradas"

# Done
echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ✅ Instalação concluída!           ║"
echo "╠══════════════════════════════════════╣"
echo "║                                      ║"
echo "║  🌐 Acesse: http://$SERVER_HOST      "
echo "║                                      ║"
echo "║  👤 Login:                            ║"
echo "║     Email: admin@axisdocs.local       ║"
echo "║     Senha: admin123                   ║"
echo "║                                      ║"
echo "║  ⚠️  Altere a senha após o 1º login!  ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Comandos úteis:"
echo "  cd $APP_DIR && docker compose logs -f"
echo "  cd $APP_DIR && docker compose restart"
echo "  cd $APP_DIR && docker compose down"
echo ""
