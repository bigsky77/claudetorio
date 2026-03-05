#!/bin/bash
set -euo pipefail

# Configuration
SERVER="factorio-server"  # SSH alias
REMOTE_PATH="/opt/claudetorio"
PACKAGES="broker frontend agent-runner run-worker stream-worker fle"

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

# 4. Validate env and prepare volumes
echo "Validating env and refreshing Factorio config/scenario volumes..."
ssh $SERVER "cd $REMOTE_PATH/machines/game-server && \
  test -f .env && \
  docker compose run --rm factorio-config-init && \
  docker compose run --rm factorio-scenarios-init && \
  docker run --rm -v claudetorio_factorio_config:/v alpine sh -c 'test -f /v/server-settings.json'"

# 5. Build broker-spawned images and restart stack
echo "Stopping broker-spawned containers..."
ssh $SERVER "docker ps -q --filter name=factorio --filter name=run-worker --filter name=stream-worker | xargs -r docker rm -f || true"

echo "Building broker-spawned images (run-worker, stream-worker) and restarting containers..."
ssh $SERVER "cd $REMOTE_PATH/machines/game-server && \
  docker compose --profile build-only build run-worker stream-worker && \
  docker image inspect claudetorio-run-worker:latest >/dev/null && \
  docker image inspect claudetorio-stream-worker:latest >/dev/null && \
  docker compose up --build -d"

# 6. Health check
echo "Checking health..."
sleep 5
ssh $SERVER "curl -s http://localhost:8080/api/status | jq ." || echo "Health check endpoint not available yet"

echo "=== Deploy complete ==="
