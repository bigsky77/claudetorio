#!/bin/bash
set -euo pipefail

log() { echo "[vtuber-debug] $*"; }

DISPLAY_NUM=":99"
mkdir -p /tmp/.X11-unix /tmp/chrome-profile
chmod 1777 /tmp/.X11-unix

# Cleanup handler
XVFB_PID=""
VNC_PID=""
NOVNC_PID=""
CHROME_PID=""

cleanup() {
    log "Shutting down..."
    [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
    [ -n "$NOVNC_PID" ] && kill "$NOVNC_PID" 2>/dev/null || true
    [ -n "$VNC_PID" ] && kill "$VNC_PID" 2>/dev/null || true
    [ -n "$XVFB_PID" ] && kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

# 1. Start Xvfb
log "Starting Xvfb on ${DISPLAY_NUM} 1920x1080x24"
Xvfb "${DISPLAY_NUM}" -screen 0 1920x1080x24 +extension GLX -ac &
XVFB_PID=$!

# Wait for display ready
log "Waiting for X display..."
ELAPSED=0
until DISPLAY="${DISPLAY_NUM}" xdpyinfo >/dev/null 2>&1; do
    [ "$ELAPSED" -ge 30 ] && { log "ERROR: X display not ready after 30s"; exit 1; }
    sleep 1; ELAPSED=$((ELAPSED+1))
done
log "X display ready (${ELAPSED}s)"

# 2. Print glxinfo diagnostic
log "=== glxinfo ==="
DISPLAY="${DISPLAY_NUM}" glxinfo 2>&1 || log "glxinfo failed (no GL driver?)"
log "=== end glxinfo ==="

# 3. Start x11vnc
log "Starting x11vnc on :5901..."
x11vnc -display "${DISPLAY_NUM}" -nopw -listen 0.0.0.0 -rfbport 5901 -forever -shared -quiet &
VNC_PID=$!

# 4. Start noVNC websockify
log "Starting noVNC on :6080 → localhost:5901..."
websockify --web /usr/share/novnc 6080 localhost:5901 &
NOVNC_PID=$!

# Give VNC a moment to be ready
sleep 2

# 5. Clear stale Chrome GPU caches
log "Clearing Chrome GPU caches..."
rm -rf /tmp/chrome-profile/GpuCache /tmp/chrome-profile/ShaderCache

# 6. Launch Chrome
# Modern Chrome routes GL through ANGLE; --use-gl=angle + --use-angle=swiftshader
# is the correct way to get software WebGL. The old --use-gl=swiftshader leaves
# ANGLE uninitialized (gl=disabled,angle=none) and WebGL stays disabled.
ANGLE_BACKEND="${ANGLE_BACKEND:-vulkan}"
log "Launching Chrome with --use-gl=angle --use-angle=${ANGLE_BACKEND}..."
DISPLAY="${DISPLAY_NUM}" google-chrome-stable \
    --no-sandbox \
    --no-first-run \
    --use-gl=angle \
    --use-angle="${ANGLE_BACKEND}" \
    --ignore-gpu-blocklist \
    --enable-webgl \
    --enable-logging \
    --log-level=0 \
    --disable-dev-shm-usage \
    --ozone-platform=x11 \
    --user-data-dir=/tmp/chrome-profile \
    file:///test.html &
CHROME_PID=$!

log "=== Ready ==="
log "  noVNC web: http://localhost:6080/vnc.html (click Connect)"
log "  Raw VNC:   localhost:5901"
log "  ANGLE_BACKEND: ${ANGLE_BACKEND}  (override with -e ANGLE_BACKEND=vulkan|opengl|swiftshader)"

# Keep container alive
tail -f /dev/null
