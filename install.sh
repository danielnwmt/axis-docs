#!/bin/bash
set -euo pipefail

APP_DIR="/opt/axisdocs"
NODE_MAJOR="20"
DEFAULT_HOST=$(hostname -I 2>/dev/null | awk '{print $1}')
SERVER_HOST="${SERVER_HOST:-${DEFAULT_HOST:-localhost}}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SOURCE_DIR="${SOURCE_DIR:-$SCRIPT_DIR}"
APP_DOMAIN="${APP_DOMAIN:-}"
SSL_EMAIL="${SSL_EMAIL:-}"
SSL_CONFIGURED="false"

. "$SCRIPT_DIR/scripts/install/lib.sh"

main_install "$@"
