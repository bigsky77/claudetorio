#!/bin/bash
set -euo pipefail

log() { echo "[entrypoint] $*"; }
fail() { echo "[entrypoint] ERROR: $*" >&2; exit 1; }

DISPLAY_WIDTH="${DISPLAY_WIDTH:-1920}"
DISPLAY_HEIGHT="${DISPLAY_HEIGHT:-1080}"
DISPLAY="${DISPLAY:-:1}"
AVATAR_PORT="${AVATAR_PORT:-12393}"
RTMP_URL="${RTMP_URL:-}"
STREAM_KEY="${STREAM_KEY:-}"

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

# 3. Set background image
if [ -f /background.png ]; then
    DISPLAY="${DISPLAY}" feh --bg-fill /background.png 2>/dev/null || true
    log "Background image set"
fi

# 4. PulseAudio with virtual null sink
log "Starting PulseAudio..."
pulseaudio --start --exit-idle-time=-1 --daemonize=true
sleep 1
pactl load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description=VirtualSpeaker 2>/dev/null || true
pactl set-default-sink virtual_speaker 2>/dev/null || true
log "PulseAudio virtual sink ready"

# 5. Open-LLM-VTuber (if available; otherwise narrate.py will skip avatar)
if command -v open-llm-vtuber >/dev/null 2>&1; then
    log "Starting Open-LLM-VTuber on port ${AVATAR_PORT}..."
    DISPLAY="${DISPLAY}" open-llm-vtuber --port "${AVATAR_PORT}" &
    AVATAR_PID=$!
    sleep 3
    log "Open-LLM-VTuber started (PID ${AVATAR_PID})"
else
    log "WARNING: open-llm-vtuber not found; avatar iframe will show placeholder"
    AVATAR_PID=""
fi

# 6. Openbox
DISPLAY="${DISPLAY}" openbox-session &
OPENBOX_PID=$!
sleep 1

# 7. Factorio client (windowed, left 75% of screen)
log "Starting Factorio client..."
DISPLAY="${DISPLAY}" /scripts/start-factorio.sh &
FACTORIO_LAUNCHER_PID=$!

ELAPSED=0
until pgrep -f "bin/x64/factorio" >/dev/null 2>&1; do
    kill -0 "${FACTORIO_LAUNCHER_PID}" 2>/dev/null || fail "Factorio launcher exited unexpectedly"
    [ "$ELAPSED" -ge 120 ] && fail "Factorio process not found after 120s"
    sleep 2; ELAPSED=$((ELAPSED+2))
done
log "Factorio running (${ELAPSED}s), waiting 8s for initial frame..."
sleep 8

# Resize Factorio window to left 75% of screen (~1430px wide)
GAME_WIDTH=$(( DISPLAY_WIDTH * 3 / 4 ))
DISPLAY="${DISPLAY}" xdotool search --onlyvisible --name "Factorio" windowsize "${GAME_WIDTH}" "${DISPLAY_HEIGHT}" 2>/dev/null || true
log "Factorio window resized to ${GAME_WIDTH}x${DISPLAY_HEIGHT}"

# 8. Chrome kiosk rendering overlay.html (covers full display, transparent over game)
log "Starting Chrome overlay..."
DISPLAY="${DISPLAY}" google-chrome \
    --no-sandbox \
    --disable-gpu \
    --kiosk \
    --window-position=0,0 \
    --window-size="${DISPLAY_WIDTH},${DISPLAY_HEIGHT}" \
    --app="file:///var/www/overlay/overlay.html" \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --noerrdialogs \
    --disable-features=TranslateUI \
    2>/dev/null &
CHROME_PID=$!
sleep 3
log "Chrome overlay started"

# 9. narrate.py (polls broker steps, generates commentary, speaks via ElevenLabs)
log "Starting narrator..."
DISPLAY="${DISPLAY}" \
    BROKER_URL="${BROKER_URL}" \
    RUN_ID="${RUN_ID}" \
    AVATAR_URL="http://localhost:${AVATAR_PORT}" \
    ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" \
    ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY}" \
    ELEVENLABS_VOICE_ID="${ELEVENLABS_VOICE_ID}" \
    CLAUDE_MODEL="${CLAUDE_MODEL:-claude-sonnet-4-20250514}" \
    STEP_INTERVAL="${STEP_INTERVAL:-5}" \
    MIN_PAUSE="${MIN_PAUSE:-10}" \
    MAX_PAUSE="${MAX_PAUSE:-30}" \
    python3.11 /app/narrate.py &
NARRATOR_PID=$!
log "Narrator started (PID ${NARRATOR_PID})"

# 10. FFmpeg — capture display + audio, encode HLS (+ optional RTMP)
log "Starting FFmpeg..."
if [ -n "${RTMP_URL}" ] && [ -n "${STREAM_KEY}" ]; then
    log "RTMP push enabled: ${RTMP_URL}/***"
    HLS_OUTPUT="[select=v,a:f=hls:hls_time=2:hls_list_size=5:hls_flags=delete_segments+append_list:hls_segment_filename=/tmp/hls/seg%05d.ts]/tmp/hls/stream.m3u8|[select=v,a:f=flv]${RTMP_URL}/${STREAM_KEY}"
    ffmpeg -loglevel warning \
        -f x11grab -framerate 30 -video_size "${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}" -draw_mouse 0 -i "${DISPLAY}" \
        -f pulse -i virtual_speaker.monitor \
        -vcodec libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
        -acodec aac -b:a 128k -ar 44100 \
        -g 60 -sc_threshold 0 \
        -f tee "${HLS_OUTPUT}" &
else
    ffmpeg -loglevel warning \
        -f x11grab -framerate 30 -video_size "${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}" -draw_mouse 0 -i "${DISPLAY}" \
        -f pulse -i virtual_speaker.monitor \
        -vcodec libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p \
        -acodec aac -b:a 128k -ar 44100 \
        -g 60 -sc_threshold 0 \
        -f hls -hls_time 2 -hls_list_size 5 \
        -hls_flags delete_segments+append_list \
        -hls_segment_filename '/tmp/hls/seg%05d.ts' \
        /tmp/hls/stream.m3u8 &
fi
FFMPEG_PID=$!

# Wait for first HLS manifest
ELAPSED=0
until [ -f /tmp/hls/stream.m3u8 ]; do
    [ "$ELAPSED" -ge 60 ] && fail "HLS stream not produced after 60s"
    sleep 1; ELAPSED=$((ELAPSED+1))
done
log "HLS manifest ready (${ELAPSED}s)"

# 11. Cleanup handler
cleanup() {
    log "Shutting down..."
    kill "${FFMPEG_PID}" 2>/dev/null || true
    kill "${NARRATOR_PID}" 2>/dev/null || true
    kill "${CHROME_PID}" 2>/dev/null || true
    pkill -f "bin/x64/factorio" 2>/dev/null || true
    [ -n "${AVATAR_PID}" ] && kill "${AVATAR_PID}" 2>/dev/null || true
    kill "${OPENBOX_PID}" 2>/dev/null || true
    kill "${XVFB_PID}" 2>/dev/null || true
    nginx -s quit 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

# 12. nginx
log "Starting nginx..."
nginx

log "=== VTuber Stream Client ==="
log "HLS: http://localhost:3000/stream.m3u8"
[ -n "${RTMP_URL}" ] && log "RTMP: ${RTMP_URL}/***"

# 13. Monitor — exit if critical processes die
while true; do
    kill -0 "${XVFB_PID}" 2>/dev/null || { log "ERROR: Xvfb died"; cleanup; exit 1; }
    kill -0 "${FFMPEG_PID}" 2>/dev/null || { log "ERROR: FFmpeg died"; cleanup; exit 1; }
    sleep 5
done
