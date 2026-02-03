#!/bin/bash
set -e

SERVER="https://app.claudetorio.ai"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f .claudetorio_session ]; then
    echo -e "${RED}Error: No active session found${NC}"
    echo "Run ./connect.sh first to start a session."
    exit 1
fi

SESSION_ID=$(cat .claudetorio_session)

echo -e "${YELLOW}Ending session ${SESSION_ID}...${NC}"
echo ""

read -p "Save your game? Enter save name (or press Enter to skip): " SAVE_NAME

if [ -n "$SAVE_NAME" ]; then
    PAYLOAD="{\"save_name\": \"$SAVE_NAME\"}"
else
    PAYLOAD="{}"
fi

RESPONSE=$(curl -s -X POST "$SERVER/api/session/$SESSION_ID/release" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

if echo "$RESPONSE" | jq -e '.detail' > /dev/null 2>&1; then
    ERROR=$(echo "$RESPONSE" | jq -r '.detail')
    echo -e "${RED}Error: ${ERROR}${NC}"
    exit 1
fi

FINAL_SCORE=$(echo "$RESPONSE" | jq -r '.final_score')
PLAYTIME=$(echo "$RESPONSE" | jq -r '.playtime_minutes')

# Cleanup
rm -f .claudetorio_session
rm -f mcp-config.json
rm -rf .claude/settings.json

echo ""
echo -e "${GREEN}=============================================================${NC}"
echo -e "${GREEN}                  Session Ended Successfully                 ${NC}"
echo -e "${GREEN}=============================================================${NC}"
echo ""
echo -e "  Final Score:  ${YELLOW}${FINAL_SCORE}${NC}"
echo -e "  Playtime:     ${PLAYTIME} minutes"
if [ -n "$SAVE_NAME" ]; then
    echo -e "  Saved as:     ${GREEN}${SAVE_NAME}${NC}"
fi
echo ""
echo -e "Check your ranking at: ${SERVER}"
echo ""
