#!/usr/bin/env bash
set -euo pipefail

# Launch QEMU NixOS VMs mirroring production server roles.
#
# Usage: ./run-vm.sh [game|stream|both]  (default: both)
#
# game-server-vm:   broker, postgres, redis, frontend, run-worker, stream-worker
# stream-server-vm: stream-agent, caddy, stream-client (spawned dynamically)
#
# Port map (host → guest):
#   game-server-vm:   SSH :2222  Broker :8080  Frontend :3000
#                     Factorio UDP :34197-34201 (live slots 0-4)
#                     Factorio UDP :35100-35102 (replay slots 0-2)
#   stream-server-vm: SSH :2223  stream-agent :8090
#                     Streams :3003-3007 (live slots 0-4)
#                     Streams :4002-4003 (replay slots 0-1)
#
# Cross-VM routing via SLIRP: from inside any VM, 10.0.2.2 = host.
# game-server-vm broker → http://10.0.2.2:8090 → stream-server-vm stream-agent
# stream-server-vm clients → 10.0.2.2:34197+  → game-server-vm Factorio UDP

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-both}"

if [[ "$TARGET" != "game" && "$TARGET" != "stream" && "$TARGET" != "both" ]]; then
  echo "Usage: $0 [game|stream|both]  (default: both)"
  exit 1
fi

build_vm() {
  local attr="$1"   # nixosConfigurations attribute, e.g. game-server-vm
  local result="$2" # output symlink name, e.g. result-game
  if [[ ! -L "$SCRIPT_DIR/$result" ]]; then
    echo "==> Building $attr (this may take a while on first run)..."
    nix build "$SCRIPT_DIR#nixosConfigurations.${attr}.config.system.build.vm" -o "$SCRIPT_DIR/$result"
    echo "==> Build complete: $result"
  else
    echo "==> $attr already built (remove $SCRIPT_DIR/$result to rebuild)"
  fi
}

print_port_map() {
  echo ""
  echo "=========================================="
  echo "  ClaudeTorio VM Port Map"
  echo "=========================================="
  echo ""
  echo "  game-server-vm:   SSH :2222  Broker :8080  Frontend :3000"
  echo "  stream-server-vm: SSH :2223  stream-agent :8090  Streams :3003-3007"
  echo ""
  echo "  SSH access:"
  echo "    ssh -p 2222 dev@localhost  (game-server, password: dev)"
  echo "    ssh -p 2223 dev@localhost  (stream-server, password: dev)"
  echo ""
  echo "  Health checks:"
  echo "    curl http://localhost:8080/api/status   # broker"
  echo "    curl http://localhost:8090/health        # stream-agent"
  echo ""
  echo "  Background VM log (both mode):"
  echo "    tail -f /tmp/claudetorio-game-vm.log"
  echo ""
  echo "  Press Ctrl+C to stop all VMs"
  echo "=========================================="
  echo ""
}

case "$TARGET" in
  game)
    build_vm "game-server-vm" "result-game"
    print_port_map
    exec "$SCRIPT_DIR/result-game/bin/run-claudetorio-game-vm"
    ;;

  stream)
    build_vm "stream-server-vm" "result-stream"
    print_port_map
    exec "$SCRIPT_DIR/result-stream/bin/run-claudetorio-stream-vm"
    ;;

  both)
    build_vm "game-server-vm" "result-game"
    build_vm "stream-server-vm" "result-stream"
    print_port_map

    echo "==> Starting game-server-vm in background (logging to /tmp/claudetorio-game-vm.log)..."
    "$SCRIPT_DIR/result-game/bin/run-claudetorio-game-vm" > /tmp/claudetorio-game-vm.log 2>&1 &
    GAME_VM_PID=$!

    cleanup() {
      echo ""
      echo "==> Stopping game-server-vm (pid $GAME_VM_PID)..."
      kill "$GAME_VM_PID" 2>/dev/null || true
    }
    trap cleanup EXIT INT TERM

    echo "==> Starting stream-server-vm in foreground..."
    "$SCRIPT_DIR/result-stream/bin/run-claudetorio-stream-vm"
    ;;
esac
