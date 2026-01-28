#!/bin/bash
set -e

# Configuration - UPDATE THIS
SERVER="https://app.claudetorio.ai"
FLE_REPO="git+https://github.com/bigsky77/factorio-learning-environment.git"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "============================================================="
echo "          CLAUDETORIO - Connect to Arena"
echo "============================================================="
echo -e "${NC}"

# Check dependencies
command -v curl >/dev/null 2>&1 || { echo -e "${RED}Error: curl is required${NC}"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo -e "${RED}Error: jq is required. Install with: sudo apt install jq${NC}"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo -e "${RED}Error: python3 is required${NC}"; exit 1; }

# Setup Python virtual environment and install FLE
setup_fle() {
    echo -e "${YELLOW}Setting up Factorio Learning Environment...${NC}"

    # Create venv if it doesn't exist
    if [ ! -d ".venv" ]; then
        echo "Creating virtual environment..."
        python3 -m venv .venv
    fi

    # Activate venv
    source .venv/bin/activate

    # Check if FLE is installed and has remote support
    if python3 -c "from fle.env.protocols._mcp import mcp; import os; os.environ['FLE_SERVER_HOST']='test'" 2>/dev/null; then
        echo -e "${GREEN}FLE with MCP support is installed${NC}"
    else
        echo "Installing FLE from Claudetorio fork..."
        pip install --upgrade pip wheel >/dev/null 2>&1
        pip install fastmcp 2>&1 | tail -3
        pip install "${FLE_REPO}" 2>&1 | tail -5
        echo -e "${GREEN}FLE installed successfully${NC}"
    fi
}

# Check for existing session
if [ -f .claudetorio_session ]; then
    EXISTING_SESSION=$(cat .claudetorio_session)
    echo -e "${YELLOW}Found existing session: ${EXISTING_SESSION}${NC}"
    echo ""
    read -p "Reconnect to existing session? (y/n): " RECONNECT
    if [ "$RECONNECT" = "y" ]; then
        SESSION_INFO=$(curl -s "$SERVER/api/session/$EXISTING_SESSION" 2>/dev/null || echo '{}')
        if echo "$SESSION_INFO" | jq -e '.session_id' > /dev/null 2>&1; then
            STATUS=$(echo "$SESSION_INFO" | jq -r '.status')
            if [ "$STATUS" = "active" ]; then
                echo -e "${GREEN}Session is still active!${NC}"
                SLOT=$(echo "$SESSION_INFO" | jq -r '.slot')
                UDP_PORT=$((34197 + SLOT))
                echo ""
                echo -e "${GREEN}============================================${NC}"
                echo -e "  Session ID:  ${EXISTING_SESSION}"
                echo -e "  Spectate:    ${SERVER#https://}:${UDP_PORT}"
                echo -e "${GREEN}============================================${NC}"
                exit 0
            fi
        fi
        echo -e "${YELLOW}Previous session has ended. Starting fresh.${NC}"
        rm .claudetorio_session
    else
        rm .claudetorio_session
    fi
fi

# Setup FLE before claiming session
setup_fle

# Get username
echo ""
read -p "Enter your username (lowercase, 2-20 chars): " USERNAME
USERNAME=$(echo "$USERNAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_')

if [ ${#USERNAME} -lt 2 ] || [ ${#USERNAME} -gt 20 ]; then
    echo -e "${RED}Error: Username must be 2-20 characters (letters, numbers, underscore)${NC}"
    exit 1
fi

# Check for existing saves
echo ""
echo "Checking for existing saves..."
SAVES=$(curl -s "$SERVER/api/users/$USERNAME/saves" 2>/dev/null || echo '[]')

# Check if response is an array (not an error object)
SAVE_NAME=""
if echo "$SAVES" | jq -e 'type == "array"' > /dev/null 2>&1; then
    SAVE_COUNT=$(echo "$SAVES" | jq 'length')
    if [ "$SAVE_COUNT" -gt "0" ]; then
        echo -e "${GREEN}Found ${SAVE_COUNT} save(s):${NC}"
        echo "$SAVES" | jq -r '.[] | "  -> \(.save_name) (score: \(.score_at_save | floor), \(.playtime_hours | floor)h played)"'
        echo ""
        read -p "Enter save name to resume (or press Enter for new game): " SAVE_NAME
    fi
fi

# Claim session
echo ""
echo "Claiming session..."

if [ -n "$SAVE_NAME" ]; then
    PAYLOAD="{\"username\": \"$USERNAME\", \"save_name\": \"$SAVE_NAME\"}"
else
    PAYLOAD="{\"username\": \"$USERNAME\"}"
fi

RESPONSE=$(curl -s -X POST "$SERVER/api/session/claim" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

# Check for errors
if echo "$RESPONSE" | jq -e '.detail' > /dev/null 2>&1; then
    ERROR=$(echo "$RESPONSE" | jq -r '.detail')
    echo -e "${RED}Error: ${ERROR}${NC}"
    exit 1
fi

# Parse response
SESSION_ID=$(echo "$RESPONSE" | jq -r '.session_id')
SLOT=$(echo "$RESPONSE" | jq -r '.slot')
UDP_PORT=$(echo "$RESPONSE" | jq -r '.udp_port')
SPECTATE_ADDR=$(echo "$RESPONSE" | jq -r '.spectate_address')
EXPIRES=$(echo "$RESPONSE" | jq -r '.expires_at')
MCP_CONFIG=$(echo "$RESPONSE" | jq '.mcp_config')

# Save session info
echo "$SESSION_ID" > .claudetorio_session

# Generate Claude Code MCP config - use .venv python
# Update the MCP config to use the venv's python
VENV_PYTHON="$(pwd)/.venv/bin/python"
MCP_CONFIG=$(echo "$MCP_CONFIG" | jq --arg py "$VENV_PYTHON" '.mcpServers["factorio-fle"].command = $py')

mkdir -p .claude
echo "$MCP_CONFIG" > .claude/settings.json

# Also create a standalone MCP config file
echo "$MCP_CONFIG" > mcp-config.json

# Test MCP server can import correctly
echo ""
echo -e "${YELLOW}Testing MCP server...${NC}"
FLE_SERVER_HOST=$(echo "$MCP_CONFIG" | jq -r '.mcpServers["factorio-fle"].env.FLE_SERVER_HOST')
FLE_RCON_PORT=$(echo "$MCP_CONFIG" | jq -r '.mcpServers["factorio-fle"].env.FLE_RCON_PORT')
FLE_RCON_PASSWORD=$(echo "$MCP_CONFIG" | jq -r '.mcpServers["factorio-fle"].env.FLE_RCON_PASSWORD')

export FLE_SERVER_HOST FLE_RCON_PORT FLE_RCON_PASSWORD
if $VENV_PYTHON -c "from fle.env.protocols._mcp import mcp; print('MCP module loaded successfully')" 2>&1; then
    echo -e "${GREEN}MCP server ready!${NC}"
else
    echo -e "${RED}MCP server failed to load. Try reinstalling:${NC}"
    echo -e "  rm -rf .venv && ./connect.sh"
fi

echo ""
echo -e "${GREEN}=============================================================${NC}"
echo -e "${GREEN}              Session Claimed Successfully!                  ${NC}"
echo -e "${GREEN}=============================================================${NC}"
echo ""
echo -e "  ${BLUE}Session ID:${NC}  $SESSION_ID"
echo -e "  ${BLUE}Username:${NC}    $USERNAME"
echo -e "  ${BLUE}Slot:${NC}        $SLOT"
echo -e "  ${BLUE}Expires:${NC}     $EXPIRES"
echo ""
echo -e "${YELLOW}=============================================================${NC}"
echo -e "${YELLOW}  TO SPECTATE YOUR GAME:${NC}"
echo -e "     1. Open Factorio"
echo -e "     2. Multiplayer -> Connect to address"
echo -e "     3. Enter: ${GREEN}${SPECTATE_ADDR}${NC}"
echo -e "${YELLOW}=============================================================${NC}"
echo ""
echo -e "${YELLOW}=============================================================${NC}"
echo -e "${YELLOW}  TO START CLAUDE CODE:${NC}"
echo -e "     claude --mcp-config mcp-config.json"
echo ""
echo -e "     Or add to your Claude Code settings:"
echo -e "     ${BLUE}$(cat mcp-config.json | jq -c)${NC}"
echo -e "${YELLOW}=============================================================${NC}"
echo ""
echo -e "${YELLOW}=============================================================${NC}"
echo -e "${YELLOW}  LEADERBOARD:${NC}"
echo -e "     ${BLUE}${SERVER}${NC}"
echo -e "${YELLOW}=============================================================${NC}"
echo ""
echo -e "${YELLOW}=============================================================${NC}"
echo -e "${YELLOW}  TO SAVE & DISCONNECT:${NC}"
echo -e "     ./disconnect.sh"
echo -e "${YELLOW}=============================================================${NC}"
echo ""
