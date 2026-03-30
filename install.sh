#!/bin/bash
set -e

# ============================================
# AxisDocs - Script de Instalação para Ubuntu
# ============================================

APP_DIR="/opt/axisdocs"
REPO_URL="https://github.com/danielnwmt/axis-docs.git"

echo ""
echo "========================================="
echo "  AxisDocs - Instalação Automatizada"
echo "========================================="
echo ""

# Verifica se é root
if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash install.sh"
  exit 1
fi

# 1. Atualiza o sistema
echo "📦 Atualizando pacotes do sistema..."
apt-get update -qq
apt-get upgrade -y -qq

# 2. Instala dependências
echo "🔧 Instalando dependências (Docker, Git, Curl)..."
apt-get install -y -qq ca-certificates curl gnupg git

# 3. Instala Docker (se não instalado)
if ! command -v docker &> /dev/null; then
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
  systemctl enable docker
  systemctl start docker
  echo "✅ Docker instalado com sucesso!"
else
  echo "✅ Docker já está instalado."
fi

# 4. Clona ou atualiza o repositório
if [ -d "$APP_DIR" ]; then
  echo "🔄 Atualizando repositório existente..."
  cd "$APP_DIR"
  git pull origin main || git pull origin master
else
  echo "📥 Clonando repositório..."
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# 5. Cria arquivo .env se não existir
if [ ! -f "$APP_DIR/.env" ]; then
  echo "⚙️  Criando arquivo .env..."
  cat > "$APP_DIR/.env" <<EOF
VITE_SUPABASE_URL=https://pevufhsuhbfnvstfoulq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBldnVmaHN1aGJmbnZzdGZvdWxxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMjQ1OTUsImV4cCI6MjA4OTkwMDU5NX0.BFMFmaGfW5tkIxS0HbfQ0sMI6qMBxVMMxO18ih0XYlo
VITE_SUPABASE_PROJECT_ID=pevufhsuhbfnvstfoulq
EOF
  echo "✅ Arquivo .env criado!"
fi

# 6. Build e start com Docker Compose
echo "🚀 Construindo e iniciando containers..."
cd "$APP_DIR"
docker compose up -d --build

# 7. Aguarda o app ficar pronto
echo "⏳ Aguardando o sistema iniciar..."
for i in $(seq 1 30); do
  if curl -sf http://localhost > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

# 8. Exibe informações finais
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "========================================="
echo "  ✅ AxisDocs instalado com sucesso!"
echo "========================================="
echo ""
echo "  🌐 Acesse: http://$LOCAL_IP"
echo "  🌐 Local:  http://localhost"
echo ""
echo "  📂 Diretório: $APP_DIR"
echo ""
echo "  Comandos úteis:"
echo "    Parar:      cd $APP_DIR && docker compose down"
echo "    Iniciar:    cd $APP_DIR && docker compose up -d"
echo "    Logs:       cd $APP_DIR && docker compose logs -f"
echo "    Atualizar:  cd $APP_DIR && git pull && docker compose up -d --build"
echo ""
echo "========================================="
