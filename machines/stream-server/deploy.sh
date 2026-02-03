#!/bin/bash
set -euo pipefail

SERVER="factorio-server-mini"
REMOTE_PATH="/opt/claudetorio"

echo "=== Deploying to stream-server ==="

# 1. Sync stream-client package
echo "Syncing packages/stream-client..."
rsync -avz --delete \
    ../../packages/stream-client/ \
    $SERVER:$REMOTE_PATH/packages/stream-client/

# 2. Sync machine config
echo "Syncing machine config..."
rsync -avz \
    docker-compose.yml \
    .env \
    $SERVER:$REMOTE_PATH/machines/stream-server/

# 3. Rebuild and restart
echo "Rebuilding containers..."
ssh $SERVER "cd $REMOTE_PATH/machines/stream-server && docker compose up --build -d"

# 4. Health check
echo "Checking stream..."
sleep 10
ssh $SERVER "docker logs factorio-stream --tail 20" || echo "Container not ready yet"

echo "=== Deploy complete ==="
