#!/bin/bash
# Smoke test for join-proof scenario
# Tests that a viewer client can join a headless server without script-event-mismatch

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# Configuration
HEADLESS_HOST="${HEADLESS_HOST:-factorio-server}"
VIEWER_HOST="${VIEWER_HOST:-factorio-server-mini}"
RCON_PORT="${RCON_PORT:-27015}"
RCON_PASSWORD="${RCON_PASSWORD:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== FLE Join-Proof Smoke Test ===${NC}"
echo ""

# Parse arguments
SLOT=${1:-0}
TIMEOUT=${2:-30}

echo -e "Testing slot: ${YELLOW}$SLOT${NC}"
echo -e "Timeout: ${YELLOW}${TIMEOUT}s${NC}"
echo ""

# Function to check for script-event-mismatch in logs
check_for_mismatch() {
    local host=$1
    local log_path=$2
    local name=$3

    echo -e "${CYAN}Checking logs on $name ($host)...${NC}"

    # Check recent log entries for script-event-mismatch
    local result=$(ssh "$host" "grep -i 'script-event-mismatch' '$log_path' 2>/dev/null | tail -5" 2>/dev/null || echo "")

    if [ -n "$result" ]; then
        echo -e "${RED}  ✗ Found script-event-mismatch errors:${NC}"
        echo "$result" | sed 's/^/    /'
        return 1
    else
        echo -e "${GREEN}  ✓ No script-event-mismatch errors found${NC}"
        return 0
    fi
}

# Function to check scenario version via RCON
check_scenario_version() {
    local host=$1
    local port=$2

    echo -e "${CYAN}Checking scenario version on $host:$port...${NC}"

    # This would require rcon-cli or similar tool
    # For now, just document the manual check
    echo -e "${YELLOW}  Manual check: Connect via RCON and run:${NC}"
    echo "    /sc rcon.print(global.runtime_version or 'unknown')"
    echo ""
}

# Function to verify scenario files match
verify_scenario_sync() {
    echo -e "${CYAN}Verifying scenario file sync...${NC}"

    HEADLESS_HASH=$(ssh "$HEADLESS_HOST" "md5sum /var/claudetorio/fle/fle/cluster/scenarios/open_world/control.lua 2>/dev/null | cut -d' ' -f1" || echo "not_found")
    VIEWER_HASH=$(ssh "$VIEWER_HOST" "md5sum /var/claudetorio-stream-server/scenarios/open_world/control.lua 2>/dev/null | cut -d' ' -f1" || echo "not_found")

    echo "  Headless control.lua: $HEADLESS_HASH"
    echo "  Viewer control.lua:   $VIEWER_HASH"

    if [ "$HEADLESS_HASH" == "not_found" ] || [ "$VIEWER_HASH" == "not_found" ]; then
        echo -e "${RED}  ✗ Could not find scenario files${NC}"
        return 1
    elif [ "$HEADLESS_HASH" == "$VIEWER_HASH" ]; then
        echo -e "${GREEN}  ✓ Scenario files match${NC}"
        return 0
    else
        echo -e "${RED}  ✗ Scenario files do NOT match!${NC}"
        echo -e "${YELLOW}    Run: scripts/deploy-scenario.sh${NC}"
        return 1
    fi
}

# Main test sequence
echo -e "${GREEN}=== Pre-flight Checks ===${NC}"
echo ""

# 1. Verify scenario files are synced
if ! verify_scenario_sync; then
    echo -e "${RED}Scenario sync failed. Fix before testing.${NC}"
    exit 1
fi
echo ""

# 2. Check for existing errors in headless logs
echo -e "${GREEN}=== Checking for Existing Errors ===${NC}"
echo ""
HEADLESS_LOG="/var/log/factorio-slot-${SLOT}.log"

# This is a basic check - adjust log path as needed
echo -e "${YELLOW}Manual verification steps:${NC}"
echo ""
echo "1. Check headless server logs for script-event-mismatch:"
echo "   ssh $HEADLESS_HOST 'grep -i script-event-mismatch $HEADLESS_LOG | tail -10'"
echo ""
echo "2. Start a viewer client and attempt to join slot $SLOT"
echo ""
echo "3. Check viewer client logs for any disconnect or mismatch errors"
echo ""
echo "4. If join succeeds, verify scenario version in-game:"
echo "   Press ~ to open console, type: /sc rcon.print(global.runtime_version)"
echo ""

# Success criteria documentation
echo -e "${GREEN}=== Success Criteria ===${NC}"
echo ""
echo "The test PASSES if:"
echo "  1. Viewer client connects without 'script-event-mismatch' error"
echo "  2. No immediate disconnect after joining"
echo "  3. global.runtime_version matches on both server and client"
echo "  4. Game continues running normally after join"
echo ""

echo "The test FAILS if:"
echo "  1. Connection refused with 'script-event-mismatch'"
echo "  2. Client disconnects immediately after joining"
echo "  3. Version mismatch between headless and viewer"
echo ""

echo -e "${GREEN}=== Automated Join Test ===${NC}"
echo ""
echo -e "${YELLOW}Note: Full automated testing requires a Factorio client binary.${NC}"
echo "For CI/CD, consider using the headless client with --connect flag."
echo ""

# If we have rcon-cli available, we can do a basic version check
if command -v rcon-cli &> /dev/null; then
    echo "Checking runtime version via RCON..."
    VERSION=$(rcon-cli -a "$HEADLESS_HOST:$RCON_PORT" -p "$RCON_PASSWORD" "rcon.print(global.runtime_version or 'not set')" 2>/dev/null || echo "rcon failed")
    echo "  Runtime version: $VERSION"
else
    echo "rcon-cli not found - skipping automated version check"
fi

echo ""
echo -e "${GREEN}Smoke test preparation complete.${NC}"
echo "Proceed with manual verification if automated checks are not available."
