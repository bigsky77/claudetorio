#!/bin/bash

SERVER="https://app.claudetorio.ai"

if [ ! -f .claudetorio_session ]; then
    echo "No active session. Run ./connect.sh to start."
    exit 0
fi

SESSION_ID=$(cat .claudetorio_session)
curl -s "$SERVER/api/session/$SESSION_ID" | jq '.'
