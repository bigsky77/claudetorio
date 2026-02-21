#!/bin/bash
set -euo pipefail

log() { echo "[entrypoint] $*"; }
fail() { echo "[entrypoint] ERROR: $*" >&2; exit 1; }

DISPLAY_WIDTH="${DISPLAY_WIDTH:-1280}"
DISPLAY_HEIGHT="${DISPLAY_HEIGHT:-720}"
DISPLAY="${DISPLAY:-:1}"

mkdir -p /tmp/hls /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix

# 1. Xvfb
log "Starting Xvfb on ${DISPLAY} ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}x24"
Xvfb "${DISPLAY}" -screen 0 "${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}x24" -ac -nolisten tcp +extension RANDR &
XVFB_PID=$!

# 2. Wait for X display
log "Waiting for X display..."
ELAPSED=0
until DISPLAY="${DISPLAY}" xdpyinfo >/dev/null 2>&1; do
    [ "$ELAPSED" -ge 120 ] && fail "X display not ready after 120s"
    sleep 1; ELAPSED=$((ELAPSED+1))
done
log "X display ready (${ELAPSED}s)"

# 3. Openbox
DISPLAY="${DISPLAY}" openbox-session &
OPENBOX_PID=$!
sleep 1

# 4. Factorio (start-factorio.sh ends with exec, so its PID becomes the factorio PID)
log "Starting Factorio client..."
DISPLAY="${DISPLAY}" /scripts/start-factorio.sh &
FACTORIO_LAUNCHER_PID=$!

# 5. Wait for factorio binary
ELAPSED=0
until pgrep -f "bin/x64/factorio" >/dev/null 2>&1; do
    kill -0 "${FACTORIO_LAUNCHER_PID}" 2>/dev/null || fail "Factorio launcher exited unexpectedly"
    [ "$ELAPSED" -ge 120 ] && fail "Factorio process not found after 120s"
    sleep 2; ELAPSED=$((ELAPSED+2))
done
log "Factorio running (${ELAPSED}s), waiting 8s for initial frame..."
sleep 8

# 6. FFmpeg — capture X display, encode HLS
log "Starting FFmpeg HLS encoder..."
ffmpeg -loglevel warning \
    -f x11grab -framerate 30 -video_size "${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}" -draw_mouse 0 -i "${DISPLAY}" \
    -vcodec libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p \
    -g 60 -sc_threshold 0 \
    -f hls -hls_time 2 -hls_list_size 5 \
    -hls_flags delete_segments+append_list \
    -hls_segment_filename '/tmp/hls/seg%05d.ts' \
    /tmp/hls/stream.m3u8 &
FFMPEG_PID=$!

# 7. Wait for first HLS manifest
ELAPSED=0
until [ -f /tmp/hls/stream.m3u8 ]; do
    [ "$ELAPSED" -ge 60 ] && fail "HLS stream not produced after 60s"
    sleep 1; ELAPSED=$((ELAPSED+1))
done
log "HLS manifest ready (${ELAPSED}s)"

# 8. Cleanup handler
cleanup() {
    log "Shutting down..."
    kill "${FFMPEG_PID}" 2>/dev/null || true
    pkill -f "bin/x64/factorio" 2>/dev/null || true
    kill "${OPENBOX_PID}" 2>/dev/null || true
    kill "${XVFB_PID}" 2>/dev/null || true
    nginx -s quit 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

# 9. nginx
log "Starting nginx..."
nginx

log "=== Factorio Stream Client ==="
log "HLS: http://localhost:3000/stream.m3u8"

# 10. Monitor — exit if critical processes die
while true; do
    kill -0 "${XVFB_PID}" 2>/dev/null || { log "ERROR: Xvfb died"; cleanup; exit 1; }
    kill -0 "${FFMPEG_PID}" 2>/dev/null || { log "ERROR: FFmpeg died"; cleanup; exit 1; }
    sleep 5
done
