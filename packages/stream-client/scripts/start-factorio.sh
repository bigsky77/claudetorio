#!/bin/bash
# Start Factorio graphical client to connect to an existing server for streaming

FACTORIO_DIR="/opt/factorio"
CONFIG_DIR="/config/factorio-data"

# Server connection settings from environment
SERVER_HOST="${SERVER_HOST:-localhost}"
SERVER_PORT="${SERVER_PORT:-34197}"

echo "=== Factorio Stream Client ==="
echo "Connecting to: ${SERVER_HOST}:${SERVER_PORT}"
echo "Config directory: ${CONFIG_DIR}"
echo ""

# Create config directory structure
mkdir -p "${CONFIG_DIR}/saves" "${CONFIG_DIR}/mods" "${CONFIG_DIR}/script-output"

# Create config.ini if it doesn't exist
# The standalone Factorio install has no config/ dir, so we generate one.
if [ ! -f "${CONFIG_DIR}/config.ini" ]; then
    cat > "${CONFIG_DIR}/config.ini" << CFGEOF
; Auto-generated config for stream client
[path]
read-data=${FACTORIO_DIR}/data
write-data=${CONFIG_DIR}

[other]
check-updates=false
enable-crash-log-uploading=false

[graphics]
full-screen=true
CFGEOF
    echo "Generated config.ini"
fi

# Wait a moment for the display to be ready
sleep 2

# Start Factorio as a client connecting to the specified server
exec "$FACTORIO_DIR/bin/x64/factorio" \
    --mp-connect "${SERVER_HOST}:${SERVER_PORT}" \
    -c "${CONFIG_DIR}/config.ini" \
    2>&1
