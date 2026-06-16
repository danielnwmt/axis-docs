#!/usr/bin/env bash
# Instala o agente de atualização do AxisDocs como serviço systemd.
# Uso: sudo bash scripts/install/install-update-agent.sh
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/axis-docs}"
PG_DB="${PG_DB:-axisdocs}"
PG_USER="${PG_USER:-axisdocs}"
POLL_INTERVAL="${POLL_INTERVAL:-10}"

if [ "$EUID" -ne 0 ]; then
  echo "Execute como root: sudo bash $0"
  exit 1
fi

AGENT_SRC="$PROJECT_DIR/scripts/install/axis-update-agent.sh"
AGENT_DST="/usr/local/bin/axis-update-agent.sh"

if [ ! -f "$AGENT_SRC" ]; then
  echo "Arquivo não encontrado: $AGENT_SRC"
  exit 1
fi

install -m 0755 "$AGENT_SRC" "$AGENT_DST"
install -m 0755 "$PROJECT_DIR/update.sh" "$PROJECT_DIR/update.sh"
touch /var/log/axis-update-agent.log
chmod 0644 /var/log/axis-update-agent.log

cat >/etc/systemd/system/axis-update-agent.service <<EOF
[Unit]
Description=AxisDocs Update Agent (poll system_updates table)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
Environment=PROJECT_DIR=$PROJECT_DIR
Environment=PG_DB=$PG_DB
Environment=PG_USER=$PG_USER
Environment=POLL_INTERVAL=$POLL_INTERVAL
Environment=UPDATE_SCRIPT=$PROJECT_DIR/update.sh
Environment=NGINX_RELOAD=true
ExecStart=/usr/local/bin/axis-update-agent.sh
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable axis-update-agent.service
systemctl restart axis-update-agent.service

echo ""
echo "✅ Agente instalado e em execução."
echo "   Status:  systemctl status axis-update-agent"
echo "   Logs:    journalctl -u axis-update-agent -f"
echo "           tail -f /var/log/axis-update-agent.log"
