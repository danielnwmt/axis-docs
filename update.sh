#!/usr/bin/env bash
# AxisDocs — Atualização manual da VPS
# Uso: sudo bash update.sh
set -euo pipefail

# === Configuração ===
PROJECT_DIR="${PROJECT_DIR:-/opt/axisdocs}"
BRANCH="${BRANCH:-main}"
REPO_URL="${REPO_URL:-https://github.com/danielnwmt/axis-docs.git}"
PKG_MANAGER="${PKG_MANAGER:-npm}"          # npm | bun
RESTART_POSTGREST="${RESTART_POSTGREST:-false}"  # true para reiniciar PostgREST
NGINX_RELOAD="${NGINX_RELOAD:-true}"

log() { echo -e "\033[1;36m[update]\033[0m $*"; }
err() { echo -e "\033[1;31m[erro]\033[0m  $*" >&2; }

trap 'err "Falha na linha $LINENO. Atualização abortada."; exit 1' ERR

log "Diretório do projeto: $PROJECT_DIR"
cd "$PROJECT_DIR"

log "Buscando atualizações do GitHub (branch: $BRANCH)..."
git fetch --all --prune
git reset --hard "origin/$BRANCH"

log "Instalando dependências com $PKG_MANAGER..."
if [ "$PKG_MANAGER" = "bun" ]; then
  bun install --frozen-lockfile
else
  npm ci
fi

log "Gerando build de produção..."
if [ "$PKG_MANAGER" = "bun" ]; then
  bun run build
else
  npm run build
fi

if [ "$NGINX_RELOAD" = "true" ]; then
  log "Recarregando Nginx..."
  systemctl reload nginx
fi

if [ "$RESTART_POSTGREST" = "true" ]; then
  log "Reiniciando PostgREST..."
  systemctl restart postgrest
fi

log "Atualização concluída com sucesso ✔"
