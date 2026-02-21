#!/usr/bin/env bash
set -euo pipefail

DISPLAY_NUM="${DISPLAY_NUM:-99}"
export DISPLAY=":${DISPLAY_NUM}"

RESOLUTION="${RESOLUTION:-1920x1080}"
WIDTH="${RESOLUTION%x*}"
HEIGHT="${RESOLUTION#*x}"
FRAMERATE="${FRAMERATE:-30}"
VIDEO_BITRATE="${VIDEO_BITRATE:-3000k}"

AVATAR_DIR="/app/claudetorio-stream-avatar"
AVATAR_PORT="12393"

CLEANING_UP=0
cleanup() {
  [ "$CLEANING_UP" -eq 1 ] && return
  CLEANING_UP=1
  echo "[vtuber] Shutting down..."
  [ -n "${FFMPEG_PID:-}"   ] && kill "$FFMPEG_PID"   2>/dev/null || true
  [ -n "${HTTPD_PID:-}"    ] && kill "$HTTPD_PID"    2>/dev/null || true
  [ -n "${BROWSER_PID:-}"  ] && kill "$BROWSER_PID"  2>/dev/null || true
  [ -n "${NGINX_PID:-}"    ] && kill "$NGINX_PID"    2>/dev/null || true
  [ -n "${AVATAR_PID:-}"   ] && kill "$AVATAR_PID"   2>/dev/null || true
  [ -n "${XVFB_PID:-}"     ] && kill "$XVFB_PID"     2>/dev/null || true
  echo "[vtuber] Done."
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

echo "=== VTuber Streamer ==="
echo "  RUN_ID:     ${RUN_ID:-?}"
echo "  BROKER_URL: ${BROKER_URL:-?}"
echo "  Resolution: ${WIDTH}x${HEIGHT} @ ${FRAMERATE}fps"
if [ -n "${RTMP_URL:-}" ]; then
  echo "  RTMP:       ${RTMP_URL:0:40}..."
else
  echo "  RTMP:       (disabled — HLS only)"
fi
echo ""

# --- 1. Clean stale X lock ---
if [ -f "/tmp/.X${DISPLAY_NUM}-lock" ]; then
  rm -f "/tmp/.X${DISPLAY_NUM}-lock" 2>/dev/null || true
fi

# --- 2. Start Xvfb ---
echo "[1/7] Starting Xvfb :${DISPLAY_NUM} (${WIDTH}x${HEIGHT}x24)..."
Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x24" +extension GLX -ac &
XVFB_PID=$!

for i in $(seq 1 30); do
  if DISPLAY="$DISPLAY" xdpyinfo >/dev/null 2>&1; then
    echo "  Xvfb ready (PID: $XVFB_PID)"
    break
  fi
  [ "$i" -eq 30 ] && echo "ERROR: Xvfb not ready after 30s" && exit 1
  sleep 1
done

# --- 3. Start PulseAudio with virtual null sink ---
echo "[2/7] Starting PulseAudio..."
pulseaudio --kill 2>/dev/null || true
sleep 1
pulseaudio --start --exit-idle-time=-1 --log-level=error 2>/dev/null || true
sleep 1
pactl load-module module-null-sink \
  sink_name=virtual_speaker \
  sink_properties=device.description="VirtualSpeaker" 2>/dev/null || true
pactl set-default-sink virtual_speaker 2>/dev/null || true
echo "  PulseAudio ready (monitor: virtual_speaker.monitor)"

# --- 4. Start nginx to serve HLS ---
echo "[3/7] Starting nginx HLS server on :3000..."
mkdir -p /tmp/hls
nginx -g "daemon off;" &
NGINX_PID=$!
sleep 1
echo "  nginx ready (PID: $NGINX_PID)"

# --- 5. Start avatar server ---
echo "[4/7] Starting claudetorio-stream-avatar on :${AVATAR_PORT}..."
if [ -d "$AVATAR_DIR" ]; then
  SHERPA_LIB="$(find "$AVATAR_DIR" -name 'libsherpa_onnx_core.so*' -printf '%h' -quit 2>/dev/null || true)"
  if [ -n "$SHERPA_LIB" ]; then
    export LD_LIBRARY_PATH="${SHERPA_LIB}:${LD_LIBRARY_PATH:-}"
  fi

  AVATAR_PYTHON="$AVATAR_DIR/.venv/bin/python"
  [ -x "$AVATAR_PYTHON" ] || AVATAR_PYTHON="python3"

  (cd "$AVATAR_DIR" && "$AVATAR_PYTHON" run_server.py) &
  AVATAR_PID=$!

  echo "  Waiting for avatar server..."
  for i in $(seq 1 120); do
    if curl -sf "http://localhost:${AVATAR_PORT}/" >/dev/null 2>&1; then
      echo "  Avatar server ready (PID: $AVATAR_PID)"
      break
    fi
    [ "$i" -eq 120 ] && echo "  WARNING: Avatar server not responding after 120s, continuing anyway."
    sleep 1
  done
else
  echo "  WARNING: Avatar directory not found, skipping avatar server"
fi

# --- 6. Serve wrapper.html via local HTTP server ---
echo "[5/7] Building wrapper.html and starting local HTTP server on :8080..."
envsubst < /app/wrapper.html > /tmp/wrapper.html
python3 -m http.server 8080 --directory /tmp >/dev/null 2>&1 &
HTTPD_PID=$!
sleep 1
echo "  HTTP server ready (PID: $HTTPD_PID)"

# --- 7. Launch Chrome ---
echo "[6/7] Launching Chrome -> http://localhost:8080/wrapper.html"

if command -v google-chrome-stable &>/dev/null; then
  BROWSER="google-chrome-stable"
elif command -v google-chrome &>/dev/null; then
  BROWSER="google-chrome"
elif command -v chromium &>/dev/null; then
  BROWSER="chromium"
else
  echo "ERROR: No Chrome/Chromium found" && exit 1
fi

$BROWSER \
  --no-sandbox \
  --disable-dev-shm-usage \
  --use-gl=angle \
  --use-angle=swiftshader \
  --enable-webgl \
  --ignore-gpu-blocklist \
  --ozone-platform=x11 \
  --start-fullscreen \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --use-fake-device-for-media-stream \
  --disable-infobars \
  --disable-extensions \
  --disable-translate \
  --no-first-run \
  --no-default-browser-check \
  --window-size="${WIDTH},${HEIGHT}" \
  --window-position=0,0 \
  --user-data-dir="/tmp/chrome-stream-profile" \
  "http://localhost:8080/wrapper.html" 2>/dev/null &
BROWSER_PID=$!

echo "  Waiting 8s for Factorio to render inside iframe..."
sleep 8

if ! kill -0 "$BROWSER_PID" 2>/dev/null; then
  echo "ERROR: Chrome exited unexpectedly" && exit 1
fi
echo "  Chrome running (PID: $BROWSER_PID)"

# --- 8. Start FFmpeg ---
# Always outputs HLS. Optionally also pushes to RTMP if RTMP_URL is set.
echo "[7/7] Starting FFmpeg..."
BUFSIZE_VAL="$(( ${VIDEO_BITRATE%k} * 2 ))k"
GOP_SIZE=$(( FRAMERATE * 2 ))
HLS_PATH="/tmp/hls/stream.m3u8"

if [ -n "${RTMP_URL:-}" ]; then
  echo "  Output: HLS + RTMP"
  ffmpeg -hide_banner -loglevel warning \
    -f x11grab -video_size "${WIDTH}x${HEIGHT}" -framerate "$FRAMERATE" -i "${DISPLAY}.0" \
    -f pulse -i virtual_speaker.monitor \
    -c:v libx264 -preset veryfast -tune zerolatency \
    -b:v "$VIDEO_BITRATE" -maxrate "$VIDEO_BITRATE" -bufsize "$BUFSIZE_VAL" \
    -pix_fmt yuv420p -g "$GOP_SIZE" \
    -c:a aac -b:a 128k -ar 44100 \
    -f hls -hls_time 2 -hls_list_size 10 \
    -hls_flags delete_segments+append_list \
    -hls_segment_filename '/tmp/hls/seg%05d.ts' \
    "$HLS_PATH" \
    -c:v libx264 -preset veryfast -tune zerolatency \
    -b:v "$VIDEO_BITRATE" -maxrate "$VIDEO_BITRATE" -bufsize "$BUFSIZE_VAL" \
    -pix_fmt yuv420p -g "$GOP_SIZE" \
    -c:a aac -b:a 128k -ar 44100 \
    -f flv "${RTMP_URL}" 2>&1 &
else
  echo "  Output: HLS only"
  ffmpeg -hide_banner -loglevel warning \
    -f x11grab -video_size "${WIDTH}x${HEIGHT}" -framerate "$FRAMERATE" -i "${DISPLAY}.0" \
    -f pulse -i virtual_speaker.monitor \
    -c:v libx264 -preset veryfast -tune zerolatency \
    -b:v "$VIDEO_BITRATE" -maxrate "$VIDEO_BITRATE" -bufsize "$BUFSIZE_VAL" \
    -pix_fmt yuv420p -g "$GOP_SIZE" \
    -c:a aac -b:a 128k -ar 44100 \
    -f hls -hls_time 2 -hls_list_size 10 \
    -hls_flags delete_segments+append_list \
    -hls_segment_filename '/tmp/hls/seg%05d.ts' \
    "$HLS_PATH" 2>&1 &
fi
FFMPEG_PID=$!

sleep 3
if ! kill -0 "$FFMPEG_PID" 2>/dev/null; then
  echo "ERROR: FFmpeg failed to start" && exit 1
fi

# Wait for first HLS segment
echo "  Waiting for HLS stream to appear..."
for i in $(seq 1 30); do
  [ -f "$HLS_PATH" ] && echo "  HLS stream ready." && break
  [ "$i" -eq 30 ] && echo "  WARNING: HLS not ready after 30s, continuing."
  sleep 1
done

echo ""
echo "========================================="
echo "  VTuber stream is LIVE"
if [ -n "${RTMP_URL:-}" ]; then
  echo "  External: ${VTUBER_PLATFORM:-?} / ${VTUBER_CHANNEL:-?}"
fi
echo "  HLS served on :3000"
echo "========================================="
echo ""

# Run narrator in foreground — container exits when it exits
exec python3 /app/narrate.py
