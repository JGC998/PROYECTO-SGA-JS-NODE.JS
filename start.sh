#!/usr/bin/env bash
# start.sh — Arranca SQL Server (Docker) + API de SGA LIN
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "▶ Arrancando SQL Server..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

echo "⏳ Esperando a que SQL Server esté listo..."
until docker exec sga-sqlserver \
    /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'SgaLocal2024!' -C -Q 'SELECT 1' \
    > /dev/null 2>&1; do
    printf "."
    sleep 3
done
echo ""
echo "✅ SQL Server listo"

echo "▶ Arrancando API..."
cd "$SCRIPT_DIR/backend"
DB_PASSWORD=SgaLocal2024! node api.js
