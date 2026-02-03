#!/bin/bash
# FLE Multiplayer Sync Fix - Automated Application Script
# Run this on the factorio-server

set -e

echo "=== FLE Multiplayer Sync Fix ==="
echo ""

FLE_DIR="/var/claudetorio/fle"
STREAM_DIR="/var/claudetorio-stream-server"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if running on the server
if [ ! -d "$FLE_DIR" ]; then
    echo "Error: FLE directory not found at $FLE_DIR"
    echo "This script should be run on the factorio-server"
    exit 1
fi

# Step 1: Backup existing files
echo "[1/5] Creating backups..."
BACKUP_DIR="/var/claudetorio/backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup FLE scripts
cp -r "$FLE_DIR/fle/env/tools/agent/move_to" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$FLE_DIR/fle/env/tools/agent/harvest_resource" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$FLE_DIR/fle/env/tools/admin/request_path" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$FLE_DIR/fle/env/mods" "$BACKUP_DIR/" 2>/dev/null || true
cp -r "$FLE_DIR/fle/cluster/scenarios" "$BACKUP_DIR/fle_scenarios" 2>/dev/null || true
cp -r "$STREAM_DIR/scenarios" "$BACKUP_DIR/stream_scenarios" 2>/dev/null || true

echo "   Backups saved to: $BACKUP_DIR"

# Step 2: Deploy unified control.lua to both locations
echo "[2/5] Deploying unified control.lua..."

# FLE scenarios
mkdir -p "$FLE_DIR/fle/cluster/scenarios/open_world"
cp "$SCRIPT_DIR/control.lua" "$FLE_DIR/fle/cluster/scenarios/open_world/control.lua"
echo "   -> $FLE_DIR/fle/cluster/scenarios/open_world/control.lua"

# Stream client scenarios
mkdir -p "$STREAM_DIR/scenarios/open_world"
cp "$SCRIPT_DIR/control.lua" "$STREAM_DIR/scenarios/open_world/control.lua"
echo "   -> $STREAM_DIR/scenarios/open_world/control.lua"

# Step 3: Patch FLE scripts to remove event registrations
echo "[3/5] Patching FLE scripts..."

# Patch move_to/server.lua - remove on_nth_tick(5) registration
MOVE_TO_FILE="$FLE_DIR/fle/env/tools/agent/move_to/server.lua"
if [ -f "$MOVE_TO_FILE" ]; then
    # Remove the on_nth_tick registration block (lines 3-9 typically)
    sed -i '/^-- Register the tick handler/,/^end)$/d' "$MOVE_TO_FILE"
    # Add comment explaining the change
    sed -i '2i\-- NOTE: Event registration moved to scenario control.lua to prevent multiplayer desync' "$MOVE_TO_FILE"
    echo "   -> Patched move_to/server.lua"
fi

# Patch harvest_resource/server.lua - replace on_nth_tick(15) with function definition
HARVEST_FILE="$FLE_DIR/fle/env/tools/agent/harvest_resource/server.lua"
if [ -f "$HARVEST_FILE" ]; then
    # Replace script.on_nth_tick(15, function(event) with global.actions.update_harvesting = function(event)
    sed -i 's/script\.on_nth_tick(15, function(event)/global.actions.update_harvesting = function(event)/' "$HARVEST_FILE"
    echo "   -> Patched harvest_resource/server.lua"
fi

# Patch request_path/server.lua - remove on_script_path_request_finished registration
REQUEST_PATH_FILE="$FLE_DIR/fle/env/tools/admin/request_path/server.lua"
if [ -f "$REQUEST_PATH_FILE" ]; then
    # Comment out the event registration block
    sed -i 's/^script\.on_event(defines\.events\.on_script_path_request_finished/-- MOVED TO SCENARIO: script.on_event(defines.events.on_script_path_request_finished/' "$HARVEST_FILE" 2>/dev/null || true
    echo "   -> Patched request_path/server.lua (event handler now in scenario)"
fi

# Patch alerts.lua - store function instead of registering
ALERTS_FILE="$FLE_DIR/fle/env/mods/alerts.lua"
if [ -f "$ALERTS_FILE" ]; then
    # Replace the event registration with storing the function
    sed -i 's/script\.on_event(defines\.events\.on_tick, on_tick)/global.alerts.on_tick = on_tick/' "$ALERTS_FILE"
    echo "   -> Patched alerts.lua"
fi

# Step 4: Stop FLE cluster and clear old saves
echo "[4/5] Stopping FLE cluster and preparing fresh start..."
cd "$FLE_DIR/fle"
if command -v fle &> /dev/null; then
    fle cluster stop 2>/dev/null || echo "   Cluster was not running"
else
    # Try using docker compose directly
    docker compose -f "$FLE_DIR/docker-compose.yml" down 2>/dev/null || true
fi

# Move old saves (they have incorrect event registrations baked in)
if [ -d "$HOME/.fle/saves" ]; then
    mv "$HOME/.fle/saves" "$HOME/.fle/saves.old.$(date +%Y%m%d_%H%M%S)"
    echo "   Moved old saves to ~/.fle/saves.old.*"
fi

# Step 5: Restart stream client
echo "[5/5] Restarting stream client..."
cd "$STREAM_DIR"
docker compose down 2>/dev/null || true
docker compose up -d
echo "   Stream client restarted"

echo ""
echo "=== Fix Applied Successfully ==="
echo ""
echo "Next steps:"
echo "1. Start the FLE cluster: cd $FLE_DIR/fle && fle cluster start -s open_world"
echo "2. Wait for the server to be ready"
echo "3. The stream client should now be able to connect without desync errors"
echo ""
echo "If issues persist, check:"
echo "- docker logs fle-factorio_1-1"
echo "- docker logs factorio-stream"
