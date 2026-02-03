#!/bin/bash
# Quick test to verify Selkies streaming works on your server
# Run this BEFORE trying to add Factorio

echo "=== Selkies Quick Test ==="
echo "This will start a test container with Firefox"
echo "Access it at: http://YOUR_SERVER_IP:8080"
echo "Login: ubuntu / mypasswd"
echo ""
echo "Press Ctrl+C to stop"
echo ""

DISTRIB_RELEASE=24.04

docker run --name selkies-test \
    -it --rm \
    --network=host \
    -e SELKIES_TURN_PROTOCOL=udp \
    -e SELKIES_TURN_PORT=3478 \
    -e TURN_MIN_PORT=65532 \
    -e TURN_MAX_PORT=65535 \
    ghcr.io/selkies-project/selkies-gstreamer/gst-py-example:main-ubuntu${DISTRIB_RELEASE}
