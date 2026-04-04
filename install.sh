#!/bin/bash
set -euo pipefail

APP_DIR="/opt/axisdocs"
REPO_URL="https://github.com/danielnwmt/axis-docs.git"
NODE_MAJOR="20"
DEFAULT_HOST=$(hostname -I 2>/dev/null | awk '{print $1}')
SERVER_HOST="${SERVER_HOST:-${DEFAULT_HOST:-localhost}}"

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

install_base_packages() {
  log "Atualizando pacotes do sistema"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git gnupg nginx
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

clean_previous() {
  if [ -d "$APP_DIR" ]; then
    log "Removendo instalação anterior em $APP_DIR"
    rm -rf "$APP_DIR"
    success "Instalação anterior removida"
  fi

  # Limpar configuração antiga do Nginx
  rm -f /etc/nginx/sites-enabled/axisdocs
  rm -f /etc/nginx/sites-available/axisdocs
  rm -f /etc/nginx/sites-enabled/default
  rm -f /etc/nginx/sites-available/default
}

prepare_repo() {
  log "Clonando repositório"
  git clone "$REPO_URL" "$APP_DIR"
  success "Repositório clonado"
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
  log "Configurando Nginx"

  # Remove ALL possible default configs (Ubuntu 22/24)
  rm -f /etc/nginx/sites-enabled/default
  rm -f /etc/nginx/sites-available/default
  rm -f /etc/nginx/conf.d/default.conf
  rm -f /etc/nginx/conf.d/default

  # Ensure directories exist
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

  cat > /etc/nginx/sites-available/axisdocs <<EOF_NGINX
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

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

  # Ensure nginx.conf includes sites-enabled
  if ! grep -q "include /etc/nginx/sites-enabled" /etc/nginx/nginx.conf 2>/dev/null; then
    sed -i '/http {/a \    include /etc/nginx/sites-enabled/*;' /etc/nginx/nginx.conf
  fi

  nginx -t
  systemctl restart nginx
  success "Nginx configurado e reiniciado"
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

echo "➡️  Reconstruindo AxisDocs (sem sincronização externa)..."
cd "$APP_DIR"
npm install --no-fund --no-audit
npm run build
nginx -t
systemctl reload nginx
echo "✅ Rebuild concluído!"
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
  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║   ✅ Instalação concluída!               ║"
  echo "╠══════════════════════════════════════════╣"
  echo "║                                          ║"
  echo "║  🌐 Acesse: http://$SERVER_HOST"
  echo "║                                          ║"
  echo "║  Comandos úteis:                         ║"
  echo "║  sudo bash $APP_DIR/update.sh"
  echo "║  sudo bash $APP_DIR/uninstall.sh"
  echo "║                                          ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
}

main() {
  print_header
  require_root
  clean_previous
  install_base_packages
  install_nodejs
  prepare_repo
  build_frontend
  configure_nginx
  write_update_script
  write_uninstall_script
  verify_installation
  print_success
}

main "$@"
