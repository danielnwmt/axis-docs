#!/usr/bin/env bash
# AxisDocs — Agente de Atualização (roda na VPS via systemd)
# Faz polling na tabela public.system_updates e executa update.sh quando há solicitação pendente.
set -uo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/axis-docs}"
PG_DB="${PG_DB:-axisdocs}"
PG_USER="${PG_USER:-axisdocs}"
POLL_INTERVAL="${POLL_INTERVAL:-10}"
UPDATE_SCRIPT="${UPDATE_SCRIPT:-$PROJECT_DIR/update.sh}"
LOG_FILE="${LOG_FILE:-/var/log/axis-update-agent.log}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

psql_run() {
  sudo -u postgres psql -d "$PG_DB" -tA -v ON_ERROR_STOP=1 -c "$1"
}

log "Agente de atualização iniciado (poll=${POLL_INTERVAL}s, dir=$PROJECT_DIR)"

while true; do
  PENDING_ID=$(psql_run "SELECT id FROM public.system_updates WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1;" 2>/dev/null || echo "")

  if [ -n "$PENDING_ID" ]; then
    log "Solicitação detectada: $PENDING_ID"

    psql_run "UPDATE public.system_updates SET status='processing', updated_at=now(), message='Agente iniciou atualização' WHERE id='$PENDING_ID';" >/dev/null || true

    if bash "$UPDATE_SCRIPT" >>"$LOG_FILE" 2>&1; then
      log "Atualização $PENDING_ID concluída com sucesso"
      psql_run "UPDATE public.system_updates SET status='success', updated_at=now(), message='Atualização aplicada com sucesso' WHERE id='$PENDING_ID';" >/dev/null || true
    else
      EXIT_CODE=$?
      log "Atualização $PENDING_ID FALHOU (exit=$EXIT_CODE)"
      psql_run "UPDATE public.system_updates SET status='failed', updated_at=now(), message='Falha na execução do update.sh (exit ${EXIT_CODE}). Veja $LOG_FILE' WHERE id='$PENDING_ID';" >/dev/null || true
    fi
  fi

  sleep "$POLL_INTERVAL"
done
