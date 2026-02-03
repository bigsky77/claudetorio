#!/bin/bash
set -euo pipefail

echo "=== Syncing latest from production ==="

# Sync saves from game server
echo "Syncing saves..."
rsync -avz --progress \
    factorio-server:/var/claudetorio/saves/ \
    "$(dirname "$0")/../saves/"

# Sync logs
echo "Syncing logs..."
rsync -avz --progress \
    factorio-server:/var/claudetorio/logs/ \
    "$(dirname "$0")/../logs/"

echo "=== Sync complete ==="
