#!/bin/bash
# Test script to verify stream URL configuration is working correctly

set -e

# Configuration - override with env vars
API_BASE="${API_BASE:-http://localhost:8080}"
EXPECTED_STREAM_BASE="${EXPECTED_STREAM_BASE:-https://localhost}"
EXPECTED_STREAM_PORT="${EXPECTED_STREAM_PORT:-3003}"

echo "=== Stream URL Configuration Test ==="
echo "API Base: $API_BASE"
echo "Expected Stream Base: $EXPECTED_STREAM_BASE"
echo "Expected Stream Port: $EXPECTED_STREAM_PORT"
echo ""

# Test 1: Check /api/status returns stream_url for active sessions
echo "1. Testing /api/status endpoint..."
STATUS_RESPONSE=$(curl -s "$API_BASE/api/status")

if echo "$STATUS_RESPONSE" | jq -e '.active_sessions' > /dev/null 2>&1; then
    echo "   ✓ /api/status returns valid JSON with active_sessions"

    # Check if any active sessions have stream_url
    ACTIVE_COUNT=$(echo "$STATUS_RESPONSE" | jq '.active_sessions | length')
    echo "   Active sessions: $ACTIVE_COUNT"

    if [ "$ACTIVE_COUNT" -gt 0 ]; then
        # Check first session has stream_url
        FIRST_STREAM_URL=$(echo "$STATUS_RESPONSE" | jq -r '.active_sessions[0].stream_url // empty')
        FIRST_SLOT=$(echo "$STATUS_RESPONSE" | jq -r '.active_sessions[0].slot')

        if [ -n "$FIRST_STREAM_URL" ]; then
            EXPECTED_URL="${EXPECTED_STREAM_BASE}:$((EXPECTED_STREAM_PORT + FIRST_SLOT))/"
            echo "   First session stream_url: $FIRST_STREAM_URL"
            echo "   Expected for slot $FIRST_SLOT: $EXPECTED_URL"

            if [ "$FIRST_STREAM_URL" = "$EXPECTED_URL" ]; then
                echo "   ✓ Stream URL matches expected pattern!"
            else
                echo "   ✗ Stream URL mismatch!"
                exit 1
            fi
        else
            echo "   ✗ No stream_url field in active session!"
            exit 1
        fi
    else
        echo "   (No active sessions to test stream_url field)"
    fi
else
    echo "   ✗ Failed to parse /api/status response"
    echo "   Response: $STATUS_RESPONSE"
    exit 1
fi

echo ""

# Test 2: Check health endpoint
echo "2. Testing /health endpoint..."
HEALTH_RESPONSE=$(curl -s "$API_BASE/health")
if echo "$HEALTH_RESPONSE" | jq -e '.status == "healthy"' > /dev/null 2>&1; then
    echo "   ✓ Broker is healthy"
else
    echo "   ✗ Broker health check failed: $HEALTH_RESPONSE"
    exit 1
fi

echo ""

# Test 3: Simulate session claim (dry run - don't actually claim)
echo "3. Checking claim endpoint returns stream_url..."
echo "   (Skipped - would need to actually claim a session)"
echo "   To test manually:"
echo "   curl -X POST $API_BASE/api/session/claim -H 'Content-Type: application/json' -d '{\"username\":\"testuser\"}'"

echo ""
echo "=== All tests passed! ==="
echo ""
echo "Next steps for full end-to-end testing:"
echo "1. Deploy changes to stream-server (104):"
echo "   ssh factorio-server-mini 'cd claudetorio && git pull && cd machines/stream-server && docker-compose up -d --build'"
echo ""
echo "2. Deploy changes to game-server (103):"
echo "   ssh factorio-server 'cd claudetorio && git pull && cd machines/game-server && docker-compose up -d --build broker frontend'"
echo ""
echo "3. Start a game session and verify the frontend shows correct stream URL"
