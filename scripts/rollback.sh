#!/bin/bash
set -euo pipefail

# Atomic rollback for both servers
# Usage: ./rollback.sh [sha]
# If no SHA provided, rolls back to previous deployment

GAME_SERVER="factorio-server"
STREAM_SERVER="factorio-server-mini"
TARGET_SHA="${1:-}"

echo "=== Claudetorio Atomic Rollback ==="

# Get current state
echo ""
echo "Current state:"
GAME_SHA=$(ssh $GAME_SERVER "cat /opt/claudetorio/.deployed-sha 2>/dev/null || echo 'unknown'")
STREAM_SHA=$(ssh $STREAM_SERVER "cat /opt/claudetorio/.deployed-sha 2>/dev/null || echo 'unknown'")
echo "  Game server:   $GAME_SHA"
echo "  Stream server: $STREAM_SHA"

# Determine target SHA
if [ -z "$TARGET_SHA" ]; then
    # Use previous SHA from game server
    TARGET_SHA=$(ssh $GAME_SERVER "cat /opt/claudetorio/.deployed-sha.prev 2>/dev/null || echo ''")
    if [ -z "$TARGET_SHA" ]; then
        echo "Error: No previous SHA found. Specify a SHA to rollback to."
        exit 1
    fi
    echo ""
    echo "Rolling back to previous: $TARGET_SHA"
else
    echo ""
    echo "Rolling back to specified: $TARGET_SHA"
fi

# Confirm
read -p "Proceed with rollback? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Rollback game server
echo ""
echo ">>> Rolling back game-server..."
ssh $GAME_SERVER bash -s << EOF
    set -e
    cd /opt/claudetorio
    git fetch origin
    git reset --hard $TARGET_SHA
    echo "$TARGET_SHA" > .deployed-sha
    cd machines/game-server
    docker compose up --build -d
    echo "Game server rolled back to $TARGET_SHA"
EOF

# Rollback stream server
echo ""
echo ">>> Rolling back stream-server..."
ssh $STREAM_SERVER bash -s << EOF
    set -e
    cd /opt/claudetorio
    git fetch origin
    git reset --hard $TARGET_SHA
    echo "$TARGET_SHA" > .deployed-sha
    cd machines/stream-server
    docker compose up --build -d
    echo "Stream server rolled back to $TARGET_SHA"
EOF

# Health checks
echo ""
echo "=== Health Checks ==="
sleep 5
echo "Game server:"
ssh $GAME_SERVER "curl -sf http://localhost:8080/api/status 2>/dev/null | head -c 200 || echo 'API not responding yet'"
echo ""
echo "Stream server:"
ssh $STREAM_SERVER "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E '(caddy|stream)'"

echo ""
echo "=== Rollback complete ==="
echo "Both servers now at: $TARGET_SHA"
