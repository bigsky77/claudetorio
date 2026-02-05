#!/bin/bash
set -euo pipefail

echo "=== ClaudeTorio Local Dev Setup ==="

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

if ! command -v docker compose &> /dev/null; then
    echo "Error: Docker Compose v2 is not installed"
    exit 1
fi

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

# Create local data directories
mkdir -p data/saves data/fle-saves

# Start docker infra (db + redis + factorio worlds)
echo "Starting Docker infra (postgres, redis, factorio worlds)..."
docker compose up -d

echo ""
echo "=== Docker Infra Running ==="
echo ""
echo "  PostgreSQL: localhost:5432"
echo "  Redis:      localhost:6379"
echo "  Factorio 0: localhost:34197 (UDP) / localhost:27000 (RCON)"
echo "  Factorio 1: localhost:34198 (UDP) / localhost:27001 (RCON)"
echo ""
echo "=== Next Steps ==="
echo ""
echo "  1. Start broker (in packages/broker/):"
echo "     source .venv/bin/activate"
echo "     set -a; source ../../dev/.env; set +a"
echo "     uvicorn main:app --reload --host 0.0.0.0 --port 8080"
echo ""
echo "  2. Start frontend (in packages/frontend/):"
echo "     npm run dev"
echo ""
echo "  Frontend:   http://localhost:3000"
echo "  Broker API: http://localhost:8080"
echo ""
echo "Commands:"
echo "  docker compose logs -f          # View logs"
echo "  docker compose down              # Stop infra"
echo "  docker compose down -v           # Stop and wipe data"
echo ""
