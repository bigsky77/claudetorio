#!/bin/bash
# Deploy join-proof scenario runtime to both headless and viewer machines
# This script ensures both machines have identical scenario files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Source scenario location
SCENARIO_SRC="$REPO_ROOT/packages/fle/fle/cluster/scenarios/open_world"

# Target locations (adjust these paths as needed for your deployment)
HEADLESS_HOST="${HEADLESS_HOST:-factorio-server}"
HEADLESS_PATH="${HEADLESS_PATH:-/var/claudetorio/fle/fle/cluster/scenarios/open_world}"

VIEWER_HOST="${VIEWER_HOST:-factorio-server-mini}"
VIEWER_PATH="${VIEWER_PATH:-/var/claudetorio-stream-server/scenarios/open_world}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== FLE Join-Proof Scenario Deployment ===${NC}"
echo ""

# Check source files exist
if [ ! -f "$SCENARIO_SRC/control.lua" ]; then
    echo -e "${RED}Error: control.lua not found at $SCENARIO_SRC${NC}"
    exit 1
fi

if [ ! -f "$SCENARIO_SRC/version.lua" ]; then
    echo -e "${RED}Error: version.lua not found at $SCENARIO_SRC${NC}"
    exit 1
fi

# Get version string
VERSION=$(grep -o 'return "[^"]*"' "$SCENARIO_SRC/version.lua" | tr -d 'return "')
echo -e "Deploying scenario version: ${YELLOW}$VERSION${NC}"
echo ""

# Calculate checksums
CONTROL_CHECKSUM=$(md5sum "$SCENARIO_SRC/control.lua" | cut -d' ' -f1)
VERSION_CHECKSUM=$(md5sum "$SCENARIO_SRC/version.lua" | cut -d' ' -f1)

echo "Local checksums:"
echo "  control.lua: $CONTROL_CHECKSUM"
echo "  version.lua: $VERSION_CHECKSUM"
echo ""

# Function to deploy to a host
deploy_to_host() {
    local host=$1
    local path=$2
    local name=$3

    echo -e "${YELLOW}Deploying to $name ($host:$path)...${NC}"

    # Test SSH connection
    if ! ssh -o ConnectTimeout=5 "$host" "echo 'SSH OK'" >/dev/null 2>&1; then
        echo -e "${RED}  Error: Cannot connect to $host${NC}"
        return 1
    fi

    # Create directory if it doesn't exist
    ssh "$host" "mkdir -p '$path'"

    # Copy scenario files
    scp -q "$SCENARIO_SRC/control.lua" "$host:$path/control.lua"
    scp -q "$SCENARIO_SRC/version.lua" "$host:$path/version.lua"

    # Copy commands.lua if it exists
    if [ -f "$SCENARIO_SRC/commands.lua" ]; then
        scp -q "$SCENARIO_SRC/commands.lua" "$host:$path/commands.lua"
    fi

    # Copy README if it exists
    if [ -f "$SCENARIO_SRC/README.md" ]; then
        scp -q "$SCENARIO_SRC/README.md" "$host:$path/README.md"
    fi

    # Verify remote checksums
    REMOTE_CONTROL=$(ssh "$host" "md5sum '$path/control.lua' 2>/dev/null | cut -d' ' -f1")
    REMOTE_VERSION=$(ssh "$host" "md5sum '$path/version.lua' 2>/dev/null | cut -d' ' -f1")

    if [ "$REMOTE_CONTROL" == "$CONTROL_CHECKSUM" ] && [ "$REMOTE_VERSION" == "$VERSION_CHECKSUM" ]; then
        echo -e "${GREEN}  ✓ Deployed successfully to $name${NC}"
        echo "    Remote control.lua: $REMOTE_CONTROL"
        echo "    Remote version.lua: $REMOTE_VERSION"
        return 0
    else
        echo -e "${RED}  ✗ Checksum mismatch on $name${NC}"
        echo "    Expected control.lua: $CONTROL_CHECKSUM, got: $REMOTE_CONTROL"
        echo "    Expected version.lua: $VERSION_CHECKSUM, got: $REMOTE_VERSION"
        return 1
    fi
}

# Deploy to both hosts
HEADLESS_OK=0
VIEWER_OK=0

if deploy_to_host "$HEADLESS_HOST" "$HEADLESS_PATH" "Headless Server"; then
    HEADLESS_OK=1
fi
echo ""

if deploy_to_host "$VIEWER_HOST" "$VIEWER_PATH" "Viewer/Stream Server"; then
    VIEWER_OK=1
fi
echo ""

# Summary
echo -e "${GREEN}=== Deployment Summary ===${NC}"
echo -e "Version: ${YELLOW}$VERSION${NC}"
if [ "$HEADLESS_OK" -eq 1 ]; then
    echo -e "Headless Server: ${GREEN}✓ OK${NC}"
else
    echo -e "Headless Server: ${RED}✗ FAILED${NC}"
fi
if [ "$VIEWER_OK" -eq 1 ]; then
    echo -e "Viewer Server:   ${GREEN}✓ OK${NC}"
else
    echo -e "Viewer Server:   ${RED}✗ FAILED${NC}"
fi
echo ""

# Reminder about save rotation
echo -e "${YELLOW}IMPORTANT: After deployment, you must:${NC}"
echo "  1. Stop all headless processes"
echo "  2. Delete or rotate saves for each slot (fresh saves required)"
echo "  3. Restart headless processes"
echo "  4. Run smoke test: scripts/smoke-join.sh"
echo ""

if [ "$HEADLESS_OK" -eq 1 ] && [ "$VIEWER_OK" -eq 1 ]; then
    echo -e "${GREEN}Deployment complete!${NC}"
    exit 0
else
    echo -e "${RED}Deployment had errors. Check the output above.${NC}"
    exit 1
fi
