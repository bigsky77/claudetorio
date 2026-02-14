#!/bin/bash
# Start Factorio graphical client to connect to an existing server for streaming

FACTORIO_DIR="/opt/factorio"
# Use ephemeral per-container runtime state to avoid host/volume permission
# mismatches when stream clients are spawned dynamically by the broker.
CONFIG_DIR="/tmp/factorio-data"
RUNTIME_FACTORIO_DIR="/tmp/factorio-client"
SOURCE_CONFIG_DIR="${FACTORIO_DIR}/config"
RUNTIME_CONFIG_INI="${CONFIG_DIR}/config.ini"

# Server connection settings from environment
SERVER_HOST="${SERVER_HOST:-localhost}"
SERVER_PORT="${SERVER_PORT:-34197}"

echo "=== Factorio Stream Client ==="
echo "Connecting to: ${SERVER_HOST}:${SERVER_PORT}"
echo "Config directory: ${CONFIG_DIR}"
echo ""

# Create config directory structure
mkdir -p "${CONFIG_DIR}/saves" "${CONFIG_DIR}/mods" "${CONFIG_DIR}/script-output"

# Try to copy any bundled Factorio config files into runtime config.
# This is best-effort because some client installs do not include config/.
if [ -d "${SOURCE_CONFIG_DIR}" ]; then
    cp -rn "${SOURCE_CONFIG_DIR}/." "${CONFIG_DIR}/" 2>/dev/null || true
    echo "Copied runtime config seed from: ${SOURCE_CONFIG_DIR}"
else
    echo "No source config directory at: ${SOURCE_CONFIG_DIR}"
fi

# Create a config-path.cfg that points Factorio to use our config directory
# This allows multiple instances to run without lock conflicts
cat > "${CONFIG_DIR}/config-path.cfg" << EOF
config-path=${CONFIG_DIR}
EOF

# Create a minimal runtime config if source config.ini is missing.
if [ ! -f "${RUNTIME_CONFIG_INI}" ]; then
    cat > "${RUNTIME_CONFIG_INI}" << EOF
[path]
write-data=${CONFIG_DIR}
EOF
    echo "Generated fallback runtime config: ${RUNTIME_CONFIG_INI}"
fi

# Ensure write-data points to our container-specific directory
# This prevents lock file conflicts between containers
if [ -f "${RUNTIME_CONFIG_INI}" ]; then
    # Update or add the write-data setting
    if grep -q "^write-data=" "${RUNTIME_CONFIG_INI}"; then
        sed -i "s|^write-data=.*|write-data=${CONFIG_DIR}|" "${RUNTIME_CONFIG_INI}"
    elif grep -q "^\[path\]" "${RUNTIME_CONFIG_INI}"; then
        sed -i "/^\[path\]/a write-data=${CONFIG_DIR}" "${RUNTIME_CONFIG_INI}"
    else
        cat >> "${RUNTIME_CONFIG_INI}" << EOF

[path]
write-data=${CONFIG_DIR}
EOF
    fi
    echo "Set write-data to: ${CONFIG_DIR}"
fi

# Guardrail: Factorio must always get a concrete config file path.
if [ ! -f "${RUNTIME_CONFIG_INI}" ]; then
    echo "ERROR: Failed to create runtime config file: ${RUNTIME_CONFIG_INI}" >&2
    exit 1
fi

# Ensure Factorio install path is writable so the client can create lock files.
# If /opt/factorio is not writable (common for mounted volumes), copy the client
# into a writable runtime location and run from there.
if ! touch "${FACTORIO_DIR}/.write-test" 2>/dev/null; then
    echo "Primary Factorio dir is not writable: ${FACTORIO_DIR}"
    echo "Copying Factorio client to writable runtime dir: ${RUNTIME_FACTORIO_DIR}"
    rm -rf "${RUNTIME_FACTORIO_DIR}"
    mkdir -p "${RUNTIME_FACTORIO_DIR}"
    if ! cp -a "${FACTORIO_DIR}/." "${RUNTIME_FACTORIO_DIR}/"; then
        echo "ERROR: Failed to copy Factorio client into ${RUNTIME_FACTORIO_DIR}" >&2
        exit 1
    fi
    FACTORIO_DIR="${RUNTIME_FACTORIO_DIR}"
    SOURCE_CONFIG_DIR="${FACTORIO_DIR}/config"
else
    rm -f "${FACTORIO_DIR}/.write-test"
fi

if [ ! -x "${FACTORIO_DIR}/bin/x64/factorio" ]; then
    echo "ERROR: Factorio binary missing or not executable at ${FACTORIO_DIR}/bin/x64/factorio" >&2
    exit 1
fi

# Ensure read-data points to the mounted/copied Factorio data directory.
# Some packaged config.ini files default to __PATH__system-read-data__ (/usr/share/factorio),
# which is not valid in this container layout.
READ_DATA_DIR="${FACTORIO_DIR}/data"
if [ ! -d "${READ_DATA_DIR}" ]; then
    echo "ERROR: Factorio data directory missing at ${READ_DATA_DIR}" >&2
    exit 1
fi

if grep -q "^read-data=" "${RUNTIME_CONFIG_INI}"; then
    sed -i "s|^read-data=.*|read-data=${READ_DATA_DIR}|" "${RUNTIME_CONFIG_INI}"
elif grep -q "^\[path\]" "${RUNTIME_CONFIG_INI}"; then
    sed -i "/^\[path\]/a read-data=${READ_DATA_DIR}" "${RUNTIME_CONFIG_INI}"
else
    cat >> "${RUNTIME_CONFIG_INI}" << EOF

[path]
read-data=${READ_DATA_DIR}
EOF
fi
echo "Set read-data to: ${READ_DATA_DIR}"

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
    -c "${RUNTIME_CONFIG_INI}" \
    2>&1
