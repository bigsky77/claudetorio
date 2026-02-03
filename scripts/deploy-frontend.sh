#!/bin/bash
set -euo pipefail

# Deploy frontend to game server
# Usage: ./scripts/deploy-frontend.sh

SERVER="factorio-server"
REMOTE_PATH="/var/claudetorio"

echo "=== Deploying Frontend to $SERVER ==="

# 1. Sync frontend package to server
echo "→ Syncing frontend files..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.env.local' \
    packages/frontend/ \
    $SERVER:$REMOTE_PATH/frontend/

# 2. Install dependencies and rebuild on server
echo "→ Installing dependencies..."
ssh $SERVER "cd $REMOTE_PATH/frontend && npm install --legacy-peer-deps"

echo "→ Building frontend..."
ssh $SERVER "cd $REMOTE_PATH/frontend && npm run build"

# 3. Restart frontend via systemd
echo "→ Restarting frontend service..."
ssh $SERVER "systemctl restart claudetorio-frontend"

# 4. Health check
echo "→ Waiting for startup..."
sleep 5
HTTP_CODE=$(ssh $SERVER "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✓ Frontend is running (HTTP $HTTP_CODE)"
else
    echo "✗ Frontend returned HTTP $HTTP_CODE"
fi

echo ""
echo "=== Frontend deployed ==="
echo "View at: http://157.254.222.103:3000"
