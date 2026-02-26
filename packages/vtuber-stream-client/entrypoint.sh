#!/bin/bash
set -euo pipefail

log() { echo "[vtuber-entrypoint] $*"; }
fail() { echo "[vtuber-entrypoint] ERROR: $*" >&2; exit 1; }

DISPLAY_NUM="${DISPLAY_NUM:-:99}"
DISPLAY_WIDTH=1920
DISPLAY_HEIGHT=1080

mkdir -p /tmp/.X11-unix /tmp/chrome-profile /var/www/html
chmod 1777 /tmp/.X11-unix

# Cleanup handler (defined early so it covers all spawned processes)
XVFB_PID=""
PULSE_PID=""
VTUBER_PID=""
CHROME_PID=""
HTTP_PID=""
FFMPEG_PID=""

cleanup() {
    log "Shutting down..."
    [ -n "$FFMPEG_PID" ] && kill "$FFMPEG_PID" 2>/dev/null || true
    [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
    [ -n "$HTTP_PID" ] && kill "$HTTP_PID" 2>/dev/null || true
    [ -n "$VTUBER_PID" ] && kill "$VTUBER_PID" 2>/dev/null || true
    [ -n "$PULSE_PID" ] && kill "$PULSE_PID" 2>/dev/null || true
    [ -n "$XVFB_PID" ] && kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

# 1. Xvfb
log "Starting Xvfb on ${DISPLAY_NUM} ${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}x24"
Xvfb "${DISPLAY_NUM}" -screen 0 "${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}x24" +extension GLX -ac &
XVFB_PID=$!

# Wait for X display
log "Waiting for X display..."
ELAPSED=0
until DISPLAY="${DISPLAY_NUM}" xdpyinfo >/dev/null 2>&1; do
    [ "$ELAPSED" -ge 60 ] && fail "X display not ready after 60s"
    sleep 1; ELAPSED=$((ELAPSED+1))
done
log "X display ready (${ELAPSED}s)"

# 2. PulseAudio null sink
log "Starting PulseAudio..."
pulseaudio --start --exit-idle-time=-1 2>/dev/null || true
sleep 1
pactl load-module module-null-sink sink_name=virtual_speaker 2>/dev/null || true

# 3. Generate conf.yaml from template and start VTuber server
log "Generating VTuber config..."
envsubst < /conf.yaml.template > /app/vtuber/conf.yaml

log "Starting Open-LLM-VTuber server..."
cd /app/vtuber && DISPLAY="${DISPLAY_NUM}" uv run run_server.py &
VTUBER_PID=$!

# Wait for VTuber server to be ready (up to 60s)
log "Waiting for VTuber server on :12393..."
ELAPSED=0
until curl -sf http://localhost:12393/ >/dev/null 2>&1; do
    kill -0 "$VTUBER_PID" 2>/dev/null || fail "VTuber server exited unexpectedly"
    [ "$ELAPSED" -ge 60 ] && fail "VTuber server not ready after 60s"
    sleep 2; ELAPSED=$((ELAPSED+2))
done
log "VTuber server ready (${ELAPSED}s)"

# 4. Generate wrapper.html (substitutes FACTORIO_STREAM_URL)
log "Generating wrapper.html..."
envsubst < /wrapper.html > /var/www/html/index.html

# 5. Start python HTTP server for wrapper page (replaces nginx)
log "Starting HTTP server on :8080..."
cd /var/www/html && python3 -m http.server 8080 &
HTTP_PID=$!

# 6. Launch Chrome in kiosk mode pointing to wrapper page
log "Launching Chrome..."
DISPLAY="${DISPLAY_NUM}" google-chrome-stable \
    --no-sandbox \
    --no-first-run \
    --no-default-browser-check \
    --use-gl=angle \
    --use-angle=swiftshader \
    --disable-dev-shm-usage \
    --ozone-platform=x11 \
    --start-fullscreen \
    --kiosk \
    --autoplay-policy=no-user-gesture-required \
    --disable-infobars \
    --window-size=1920,1080 \
    --window-position=0,0 \
    --user-data-dir=/tmp/chrome-profile \
    http://localhost:8080/ &
CHROME_PID=$!

# 7. Wait for browser to render
log "Waiting 8s for browser to render..."
sleep 8

# 8. Build RTMP output list from stream key env vars
OUTPUTS=()
[ -n "${TWITCH_STREAM_KEY:-}" ] && OUTPUTS+=("rtmp://live.twitch.tv/app/${TWITCH_STREAM_KEY}")
[ -n "${KICK_STREAM_KEY:-}" ]   && OUTPUTS+=("rtmps://fa723fc1b171.global-contribute.live-video.net/app/${KICK_STREAM_KEY}")

if [ ${#OUTPUTS[@]} -eq 0 ]; then
    fail "No stream keys configured (TWITCH_STREAM_KEY / KICK_STREAM_KEY)"
fi

OUTPUT_ARGS=()
for url in "${OUTPUTS[@]}"; do
    OUTPUT_ARGS+=(
        "-map" "0:v" "-map" "1:a"
        "-vcodec" "libx264" "-preset" "ultrafast" "-tune" "zerolatency"
        "-pix_fmt" "yuv420p" "-g" "60" "-sc_threshold" "0" "-b:v" "3000k"
        "-acodec" "aac" "-ar" "44100" "-b:a" "128k"
        "-f" "flv" "$url"
    )
done

# 9. FFmpeg: x11grab + PulseAudio → H.264+AAC → RTMP directly
log "Starting FFmpeg RTMP encoder (${#OUTPUTS[@]} destination(s))..."
ffmpeg -loglevel warning \
    -f x11grab -framerate 30 -video_size "${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}" -draw_mouse 0 -i "${DISPLAY_NUM}" \
    -f pulse -i virtual_speaker.monitor \
    "${OUTPUT_ARGS[@]}" &
FFMPEG_PID=$!

# 10. Wait 5s then confirm FFmpeg is alive → write /tmp/streaming sentinel
sleep 5
if ! kill -0 "$FFMPEG_PID" 2>/dev/null; then
    fail "FFmpeg died before streaming started"
fi
touch /tmp/streaming
log "=== Streaming to RTMP (${#OUTPUTS[@]} destination(s)) ==="

# 11. Monitor loop: exit container if FFmpeg or VTuber server dies
while true; do
    kill -0 "$XVFB_PID" 2>/dev/null || { log "ERROR: Xvfb died"; cleanup; exit 1; }
    kill -0 "$FFMPEG_PID" 2>/dev/null || { log "ERROR: FFmpeg died"; cleanup; exit 1; }
    kill -0 "$VTUBER_PID" 2>/dev/null || { log "ERROR: VTuber server died"; cleanup; exit 1; }
    sleep 5
done
