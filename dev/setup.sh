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
    echo "Please edit .env and add your ANTHROPIC_API_KEY if you want to run agents"
fi

# Build and start services
echo "Building and starting services..."
docker compose up --build -d

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Services:"
echo "  Frontend:   http://localhost:3000"
echo "  Broker API: http://localhost:8080"
echo "  PostgreSQL: localhost:5432"
echo "  Redis:      localhost:6379"
echo "  Factorio:   localhost:34197 (UDP)"
echo ""
echo "Commands:"
echo "  docker compose logs -f          # View logs"
echo "  docker compose down              # Stop services"
echo "  docker compose down -v           # Stop and remove data"
echo ""
