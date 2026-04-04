#!/bin/bash

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

    # Gera email automaticamente a partir do domínio
    if [ -z "$SSL_EMAIL" ]; then
      SSL_EMAIL="admin@$APP_DOMAIN"
    fi

    SERVER_HOST="$APP_DOMAIN"
    log "SSL será configurado automaticamente para $APP_DOMAIN (email: $SSL_EMAIL)"
  fi

  # Configuração do backend (Supabase) independente por instalação
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║  Configuração do Backend (Supabase)      ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "Cada instalação precisa de seu próprio projeto Supabase."
  echo "Crie um projeto gratuito em https://supabase.com ou use Supabase self-hosted."
  echo ""

  if [ -z "${SUPABASE_URL:-}" ] && [ -t 0 ]; then
    printf "URL do Supabase (ex: https://xxxxx.supabase.co): "
    read -r SUPABASE_URL
  fi

  if [ -z "${SUPABASE_URL:-}" ]; then
    fail "URL do Supabase é obrigatória"
  fi

  if [ -z "${SUPABASE_ANON_KEY:-}" ] && [ -t 0 ]; then
    printf "Anon Key do Supabase: "
    read -r SUPABASE_ANON_KEY
  fi

  if [ -z "${SUPABASE_ANON_KEY:-}" ]; then
    fail "Anon Key do Supabase é obrigatória"
  fi

  if [ -z "${SUPABASE_PROJECT_ID:-}" ]; then
    # Extrai o project ref da URL automaticamente
    SUPABASE_PROJECT_ID=$(echo "$SUPABASE_URL" | sed -n 's|https://\([^.]*\)\.supabase\.co|\1|p')
  fi

  if [ -z "${SUPABASE_PROJECT_ID:-}" ] && [ -t 0 ]; then
    printf "Project ID do Supabase: "
    read -r SUPABASE_PROJECT_ID
  fi

  success "Backend configurado: $SUPABASE_URL"
}

install_base_packages() {
  log "Atualizando pacotes do sistema"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg nginx
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
  apt-get update -qq
  apt-get install -y -qq nodejs
  success "Node.js $(node -v) instalado"
}

install_ssl_packages() {
  if [ -z "$APP_DOMAIN" ]; then
    return
  fi

  log "Instalando pacotes de SSL"
  apt-get install -y -qq certbot python3-certbot-nginx
  success "Pacotes de SSL instalados"
}

clean_previous() {
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
  cat > "$APP_DIR/.env" <<EOF_ENV
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PROJECT_ID=${SUPABASE_PROJECT_ID:-}
EOF_ENV
  success "Arquivo .env gerado com credenciais do backend"
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

  log "Configurando Nginx"

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
  success "Nginx configurado e reiniciado"
}

enable_ssl() {
  if [ -z "$APP_DOMAIN" ]; then
    return
  fi

  log "Emitindo certificado SSL para $APP_DOMAIN"

  if certbot --nginx --non-interactive --agree-tos --redirect -m "$SSL_EMAIL" -d "$APP_DOMAIN"; then
    SSL_CONFIGURED="true"
    success "SSL configurado com sucesso"
    return
  fi

  fail "Falha ao configurar SSL. Verifique se o domínio aponta para este servidor e tente novamente"
}

write_update_script() {
cat > "$APP_DIR/update.sh" <<'EOF_UPDATE'
#!/bin/bash
set -euo pipefail

APP_DIR="/opt/axisdocs"

if [ "$EUID" -ne 0 ]; then
  echo "❌ Execute como root: sudo bash update.sh"
  exit 1
fi

echo "➡️  Reconstruindo AxisDocs (somente local, sem sincronização externa)..."
cd "$APP_DIR"
npm install --no-fund --no-audit
npm run build
nginx -t
systemctl reload nginx
echo "✅ Rebuild local concluído!"
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
rm -f /etc/nginx/sites-enabled/axisdocs
rm -f /etc/nginx/sites-available/axisdocs
nginx -t >/dev/null 2>&1 && systemctl restart nginx || true
rm -rf "$APP_DIR"
echo "✅ AxisDocs removido com sucesso!"
echo "ℹ️  Nginx e Node.js continuam instalados no servidor."
EOF_UNINSTALL

  chmod +x "$APP_DIR/uninstall.sh"
}

verify_installation() {
  log "Validando resposta HTTP local"

  for _ in $(seq 1 15); do
    if curl -fsSI http://127.0.0.1/ >/dev/null 2>&1; then
      success "Aplicação respondendo localmente"
      return
    fi
    sleep 1
  done

  fail "O Nginx não respondeu corretamente após a instalação"
}

print_success() {
  local access_url

  if [ "$SSL_CONFIGURED" = "true" ]; then
    access_url="https://$SERVER_HOST"
  else
    access_url="http://$SERVER_HOST"
  fi

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║   ✅ Instalação concluída!               ║"
  echo "╠══════════════════════════════════════════╣"
  echo "║                                          ║"
  echo "║  🌐 Acesse: $access_url"
  echo "║                                          ║"
  echo "║  Comandos úteis:                         ║"
  echo "║  sudo bash $APP_DIR/update.sh"
  echo "║  sudo bash $APP_DIR/uninstall.sh"
  echo "║                                          ║"
  echo "╚══════════════════════════════════════════╝"
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
  install_ssl_packages
  prepare_app_files
  build_frontend
  configure_nginx
  enable_ssl
  write_update_script
  write_uninstall_script
  verify_installation
  print_success
}
