#!/bin/bash
set -euo pipefail

SERVER="factorio-server-mini"
REMOTE_PATH="/opt/claudetorio"

echo "=== Deploying to stream-server ==="

# 1. Sync stream-client, stream-worker, and stream-agent packages
for pkg in stream-client stream-worker stream-agent vtuber-stream-client; do
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
    $SERVER:$REMOTE_PATH/machines/stream-server/

# 3. Validate env, build images, populate volume, restart stack
echo "Building images, refreshing Factorio client volume, and restarting containers..."
ssh $SERVER "cd $REMOTE_PATH/machines/stream-server && \
  test -f .env && \
  export FACTORIO_CLIENT_PATH=\$(grep -E '^FACTORIO_CLIENT_PATH=' .env | tail -n1 | cut -d= -f2-) && \
  test -n \"\$FACTORIO_CLIENT_PATH\" && \
  test -d \"\$FACTORIO_CLIENT_PATH\" || { echo 'ERROR: FACTORIO_CLIENT_PATH not found'; exit 1; } && \
  docker compose --profile build-only build stream-client stream-worker vtuber-stream-client && \
  docker image inspect claudetorio-stream-client:latest >/dev/null && \
  docker image inspect claudetorio-vtuber-stream-client:latest >/dev/null && \
  docker compose run --rm factorio-client-init && \
  docker run --rm -v claudetorio_factorio_client:/v alpine sh -c 'test -e /v/bin/x64/factorio || test -e /v/bin/factorio' && \
  docker compose up --build -d"

# 4. Health check
echo "Checking health..."
sleep 5
ssh $SERVER "curl -sf http://localhost:8090/health && echo 'stream-agent healthy'" || echo "stream-agent not ready yet"
ssh $SERVER "docker ps | grep -q caddy && echo 'Caddy running'" || echo "Caddy not ready yet"

echo "=== Deploy complete ==="
