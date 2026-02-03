#!/bin/bash
set -euo pipefail

echo "=== Deploying to all servers ==="

# Deploy game server
echo ""
echo ">>> Deploying game-server..."
cd "$(dirname "$0")/../machines/game-server"
./deploy.sh

# Deploy stream server
echo ""
echo ">>> Deploying stream-server..."
cd "$(dirname "$0")/../machines/stream-server"
./deploy.sh

echo ""
echo "=== All deployments complete ==="
