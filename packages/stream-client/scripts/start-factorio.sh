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

# Create a config-path.cfg that points Factorio to use our config directory
# This allows multiple instances to run without lock conflicts
cat > "${CONFIG_DIR}/config-path.cfg" << EOF
config-path=${CONFIG_DIR}
EOF

# Create/update config.ini with per-container write-data path
# This is CRITICAL for running multiple instances - the lock file goes in write-data
if [ ! -f "${CONFIG_DIR}/config.ini" ]; then
    cp "${FACTORIO_DIR}/config/config.ini" "${CONFIG_DIR}/config.ini" 2>/dev/null || true
fi

# Ensure write-data points to our container-specific directory
# This prevents lock file conflicts between containers
if [ -f "${CONFIG_DIR}/config.ini" ]; then
    # Update or add the write-data setting
    if grep -q "^write-data=" "${CONFIG_DIR}/config.ini"; then
        sed -i "s|^write-data=.*|write-data=${CONFIG_DIR}|" "${CONFIG_DIR}/config.ini"
    else
        # Add it after the [path] section
        sed -i "/^\[path\]/a write-data=${CONFIG_DIR}" "${CONFIG_DIR}/config.ini"
    fi
    echo "Set write-data to: ${CONFIG_DIR}"
fi

# Disable Steam API by renaming the library
# This makes Factorio run in standalone mode without trying to restart via Steam
if [ -f "$FACTORIO_DIR/lib/libsteam_api.so" ]; then
    echo "Disabling Steam API..."
    mv "$FACTORIO_DIR/lib/libsteam_api.so" "$FACTORIO_DIR/lib/libsteam_api.so.disabled" 2>/dev/null || true
fi

# Wait a moment for the display to be ready
sleep 2

# Start Factorio as a client connecting to the specified server
# -c uses a per-container config to avoid lock conflicts
exec "$FACTORIO_DIR/bin/x64/factorio" \
    --mp-connect "${SERVER_HOST}:${SERVER_PORT}" \
    -c "${CONFIG_DIR}/config.ini" \
    2>&1
