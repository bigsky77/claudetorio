#!/bin/bash
# Start Factorio graphical client to connect to an existing server for streaming

FACTORIO_DIR="/opt/factorio"

# Server connection settings from environment
SERVER_HOST="${SERVER_HOST:-localhost}"
SERVER_PORT="${SERVER_PORT:-34197}"

echo "=== Factorio Stream Client ==="
echo "Connecting to: ${SERVER_HOST}:${SERVER_PORT}"
echo ""

# Disable Steam API by renaming the library
# This makes Factorio run in standalone mode without trying to restart via Steam
if [ -f "$FACTORIO_DIR/lib/libsteam_api.so" ]; then
    echo "Disabling Steam API..."
    mv "$FACTORIO_DIR/lib/libsteam_api.so" "$FACTORIO_DIR/lib/libsteam_api.so.disabled"
fi

# Wait a moment for the display to be ready
sleep 2

# Start Factorio as a client connecting to the specified server
# --mp-connect connects to a multiplayer server
exec "$FACTORIO_DIR/bin/x64/factorio" \
    --mp-connect "${SERVER_HOST}:${SERVER_PORT}" \
    2>&1
