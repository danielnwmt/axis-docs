#!/bin/bash
set -e

echo ""
echo "🔄 Atualizando Axis Docs..."
echo ""

# Pull latest code
git pull origin main 2>/dev/null || git pull

# Rebuild and restart only the app container
docker compose up -d --build app

echo ""
echo "✅ Atualização concluída!"
echo "🌐 Acesse: http://$(grep SERVER_HOST .env 2>/dev/null | cut -d= -f2 || echo localhost)"
echo ""
