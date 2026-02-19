#!/bin/bash
set -euo pipefail

# Ensure environment file values are available for child processes.
[ -f /etc/environment ] && . /etc/environment

export DISPLAY="${DISPLAY:-:1}"
TIMEOUT=120
ELAPSED=0

echo "[startwm] Waiting for X display ${DISPLAY}..."
until xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1; do
    if [ "${ELAPSED}" -ge "${TIMEOUT}" ]; then
        echo "[startwm] ERROR: display ${DISPLAY} not ready after ${TIMEOUT}s" >&2
        exit 1
    fi
    sleep 1
    ELAPSED=$((ELAPSED + 1))
done
echo "[startwm] Display ${DISPLAY} ready after ${ELAPSED}s"

# Launch Factorio startup independently from Openbox autostart race timing.
/scripts/start-factorio.sh >> /proc/1/fd/1 2>> /proc/1/fd/2 &
echo "[startwm] Launched /scripts/start-factorio.sh in background"

exec openbox-session
