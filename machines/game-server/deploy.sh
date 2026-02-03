#!/bin/bash
set -euo pipefail

# Configuration
SERVER="factorio-server"  # SSH alias
REMOTE_PATH="/opt/claudetorio"
PACKAGES="broker frontend agent-runner"

echo "=== Deploying to game-server ==="

# 1. Sync packages
for pkg in $PACKAGES; do
    echo "Syncing packages/$pkg..."
    rsync -avz --delete \
        ../../packages/$pkg/ \
        $SERVER:$REMOTE_PATH/packages/$pkg/
done

# 2. Sync machine config
echo "Syncing machine config..."
rsync -avz \
    docker-compose.yml \
    .env \
    $SERVER:$REMOTE_PATH/machines/game-server/

# 3. Sync shared config
echo "Syncing shared config..."
rsync -avz --delete \
    ../../config/ \
    $SERVER:$REMOTE_PATH/config/

# 4. Rebuild and restart
echo "Rebuilding containers..."
ssh $SERVER "cd $REMOTE_PATH/machines/game-server && docker compose up --build -d"

# 5. Health check
echo "Checking health..."
sleep 5
ssh $SERVER "curl -s http://localhost:8080/api/status | jq ." || echo "Health check endpoint not available yet"

echo "=== Deploy complete ==="
