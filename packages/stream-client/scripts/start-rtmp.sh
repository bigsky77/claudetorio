#!/bin/bash
set -euo pipefail

OUTPUTS=()
[ -n "${TWITCH_STREAM_KEY:-}" ] && OUTPUTS+=("rtmp://live.twitch.tv/app/${TWITCH_STREAM_KEY}")
[ -n "${KICK_STREAM_KEY:-}" ]   && OUTPUTS+=("rtmps://fa723fc1b171.global-contribute.live-video.net/app/${KICK_STREAM_KEY}")

if [ ${#OUTPUTS[@]} -eq 0 ]; then
    echo "No stream keys configured (TWITCH_STREAM_KEY / KICK_STREAM_KEY)" >&2
    exit 1
fi

# Each destination gets its own -map + codec + format block.
# FFmpeg multi-output is more reliable than the tee muxer, especially
# when mixing rtmp:// and rtmps:// targets.
OUTPUT_ARGS=()
for url in "${OUTPUTS[@]}"; do
    OUTPUT_ARGS+=("-map" "0:v" "-map" "1:a" "-vcodec" "copy" "-acodec" "aac" "-ar" "44100" "-b:a" "128k" "-f" "flv" "$url")
done

ffmpeg -loglevel warning \
    -re -i http://localhost:3000/stream.m3u8 \
    -f lavfi -i anullsrc=r=44100:cl=stereo \
    "${OUTPUT_ARGS[@]}" &

echo $! > /tmp/rtmp.pid
echo "RTMP push started (pid=$!)"
