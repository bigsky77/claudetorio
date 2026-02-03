#!/bin/bash

echo "=== ClaudeTorio Health Check ==="

# Check game server
echo ""
echo ">>> Game Server (157.254.222.103)"
echo "Broker API:"
curl -s http://157.254.222.103:8080/api/status | jq . 2>/dev/null || echo "  FAIL: Broker not responding"

echo ""
echo "Frontend:"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://157.254.222.103:3000 || echo "  FAIL: Frontend not responding"

# Check stream server
echo ""
echo ">>> Stream Server (157.254.222.104)"
echo "Stream (HTTP):"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://157.254.222.104:3002 || echo "  FAIL: Stream not responding"

echo ""
echo "=== Health check complete ==="
