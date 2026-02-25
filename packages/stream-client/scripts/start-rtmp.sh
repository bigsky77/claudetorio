#!/bin/bash
set -euo pipefail

OUTPUTS=()
[ -n "${TWITCH_STREAM_KEY:-}" ] && OUTPUTS+=("rtmp://live.twitch.tv/app/${TWITCH_STREAM_KEY}")
[ -n "${KICK_STREAM_KEY:-}" ]   && OUTPUTS+=("rtmp://fa723fc1b171.global-contribute.live-video.net/app/${KICK_STREAM_KEY}")

if [ ${#OUTPUTS[@]} -eq 0 ]; then
    echo "No stream keys configured (TWITCH_STREAM_KEY / KICK_STREAM_KEY)" >&2
    exit 1
fi

# Build tee sink string if pushing to multiple destinations, else single output
if [ ${#OUTPUTS[@]} -eq 1 ]; then
    OUTPUT_ARGS=("-f" "flv" "${OUTPUTS[0]}")
else
    TEE=$(printf "[f=flv]%s" "${OUTPUTS[0]}")
    for url in "${OUTPUTS[@]:1}"; do TEE+="|[f=flv]${url}"; done
    OUTPUT_ARGS=("-f" "tee" "$TEE")
fi

ffmpeg -loglevel warning \
    -re -i http://localhost:3000/stream.m3u8 \
    -f lavfi -i anullsrc=r=44100:cl=stereo \
    -map 0:v -map 1:a \
    -vcodec copy -acodec aac -ar 44100 -b:a 128k \
    "${OUTPUT_ARGS[@]}" &

echo $! > /tmp/rtmp.pid
echo "RTMP push started (pid=$!)"
