#!/bin/bash
set -euo pipefail

log() { echo "[vtuber-entrypoint] $*"; }
fail() { echo "[vtuber-entrypoint] ERROR: $*" >&2; exit 1; }

DISPLAY_NUM="${DISPLAY_NUM:-:99}"
DISPLAY_WIDTH=1920
DISPLAY_HEIGHT=1080
VTUBER_AUDIO_DEBUG="${VTUBER_AUDIO_DEBUG:-1}"

mkdir -p /tmp/.X11-unix /tmp/chrome-profile /var/www/html
chmod 1777 /tmp/.X11-unix

# Cleanup handler (defined early so it covers all spawned processes)
XVFB_PID=""
PULSE_PID=""
VTUBER_PID=""
CHROME_PID=""
HTTP_PID=""
FFMPEG_PID=""
NARRATE_PID=""

cleanup() {
    log "Shutting down..."
    [ -n "$NARRATE_PID" ] && kill "$NARRATE_PID" 2>/dev/null || true
    [ -n "$FFMPEG_PID" ] && kill "$FFMPEG_PID" 2>/dev/null || true
    [ -n "$CHROME_PID" ] && kill "$CHROME_PID" 2>/dev/null || true
    [ -n "$HTTP_PID" ] && kill "$HTTP_PID" 2>/dev/null || true
    [ -n "$VTUBER_PID" ] && kill "$VTUBER_PID" 2>/dev/null || true
    pulseaudio --kill 2>/dev/null || true
    [ -n "$PULSE_PID" ] && kill "$PULSE_PID" 2>/dev/null || true
    [ -n "$XVFB_PID" ] && kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup SIGTERM SIGINT

wait_for_pulse() {
    local elapsed=0
    until pactl info >/dev/null 2>&1; do
        if [ "$elapsed" -ge 20 ]; then
            return 1
        fi
        sleep 1
        elapsed=$((elapsed+1))
    done
    return 0
}

audio_diag_snapshot() {
    local label="$1"
    log "Audio diag (${label}): pactl info"
    pactl info || true
    log "Audio diag (${label}): sinks"
    pactl list short sinks || true
    log "Audio diag (${label}): sources"
    pactl list short sources || true
}

audio_diag_sink_inputs() {
    local label="$1"
    log "Audio diag (${label}): sink-inputs"
    pactl list short sink-inputs || true
}

audio_diag_poll_sink_inputs() {
    local rounds="${1:-8}"
    local interval="${2:-2}"
    local found=0
    local i
    for i in $(seq 1 "$rounds"); do
        local out=""
        out="$(pactl list short sink-inputs 2>/dev/null || true)"
        if [ -n "$out" ]; then
            found=1
            log "Audio diag (sink-inputs poll ${i}/${rounds}):"
            printf '%s\n' "$out"
        else
            log "Audio diag (sink-inputs poll ${i}/${rounds}): none"
        fi
        sleep "$interval"
    done
    if [ "$found" -eq 0 ]; then
        log "WARNING: Chrome is not writing audio to PulseAudio (no sink-inputs found)"
    fi
}

audio_diag_probe_monitor() {
    [ "$VTUBER_AUDIO_DEBUG" = "1" ] || return 0
    log "Audio diag: probing virtual_speaker.monitor for signal (ffmpeg astats)"
    timeout 6 ffmpeg -hide_banner -loglevel info \
        -f pulse -i virtual_speaker.monitor \
        -t 3 \
        -af astats=metadata=1:reset=1 \
        -f null - >/tmp/vtuber-audio-probe.log 2>&1 || true
    sed -n '1,200p' /tmp/vtuber-audio-probe.log || true
}

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
pulseaudio --kill 2>/dev/null || true
sleep 1
pulseaudio --start --exit-idle-time=-1 --log-level=error 2>/dev/null || true
sleep 1

wait_for_pulse || fail "PulseAudio did not become ready"

pactl load-module module-null-sink \
    sink_name=virtual_speaker \
    sink_properties=device.description=VirtualSpeaker >/dev/null 2>&1 || true
pactl set-default-sink virtual_speaker >/dev/null 2>&1 || true
pactl set-default-source virtual_speaker.monitor >/dev/null 2>&1 || true

audio_diag_snapshot "post-pulse-setup"

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

# 3b. Start narrator
log "Starting narrator..."
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}" \
ELEVENLABS_API_KEY="${ELEVENLABS_API_KEY:-}" \
BROKER_URL="${BROKER_URL:-https://app.claudetorio.ai}" \
AVATAR_URL="http://localhost:12393" \
  python3 /narrate.py >> /tmp/narrator.log 2>&1 &
NARRATE_PID=$!
log "Narrator running (PID: $NARRATE_PID, log: /tmp/narrator.log)"

# Sanity check: verify our patched embed.html is being served (best-effort)
if curl -sf http://localhost:12393/embed.html | grep -q "enable-audio"; then
    log "Patched embed.html sanity check passed (enable-audio hook present)"
else
    log "WARNING: embed.html sanity check failed; upstream embed may be active"
fi

# 4. Generate wrapper.html (substitutes FRONTEND_URL)
log "Generating wrapper.html..."
envsubst < /wrapper.html > /var/www/html/index.html

# 5. Start python HTTP server for wrapper page on compatibility port 3000
log "Starting HTTP server on :3000..."
cd /var/www/html && python3 -m http.server 3000 &
HTTP_PID=$!

# 6. Launch Chrome in kiosk mode pointing to wrapper page
log "Launching Chrome..."
unset DBUS_SESSION_BUS_ADDRESS || true
DISPLAY="${DISPLAY_NUM}" google-chrome-stable \
    --no-sandbox \
    --no-first-run \
    --no-default-browser-check \
    --use-gl=desktop \
    --disable-dev-shm-usage \
    --ozone-platform=x11 \
    --start-fullscreen \
    --kiosk \
    --autoplay-policy=no-user-gesture-required \
    --use-fake-ui-for-media-stream \
    --use-fake-device-for-media-stream \
    --disable-infobars \
    --window-size=1920,1080 \
    --window-position=0,0 \
    --user-data-dir=/tmp/chrome-profile \
    http://localhost:3000/ &
CHROME_PID=$!

# 7. Wait for browser to render
log "Waiting 8s for browser to render..."
sleep 8

audio_diag_sink_inputs "after-chrome-start"
if [ "$VTUBER_AUDIO_DEBUG" = "1" ]; then
    audio_diag_poll_sink_inputs 10 2
    audio_diag_probe_monitor
fi

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
    -thread_queue_size 1024 \
    -f x11grab -framerate 30 -video_size "${DISPLAY_WIDTH}x${DISPLAY_HEIGHT}" -draw_mouse 0 -i "${DISPLAY_NUM}" \
    -thread_queue_size 1024 \
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
