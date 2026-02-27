#!/bin/bash
set -euo pipefail
if [ ! -f /tmp/rtmp.pid ]; then
    echo "No RTMP push running (no pid file)"
    exit 0
fi
PID=$(cat /tmp/rtmp.pid)
kill -INT "$PID" 2>/dev/null || true
for _ in $(seq 1 15); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
rm -f /tmp/rtmp.pid
echo "RTMP push stopped"
