#!/usr/bin/env bash
set -euo pipefail

# ClaudeTorio Development VM Runner

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if VM is built
if [ ! -L "result" ]; then
    echo "Building VM (this may take a few minutes on first run)..."
    nix build .#nixosConfigurations.dev-vm.config.system.build.vm
fi

echo "=========================================="
echo "Starting ClaudeTorio Development VM"
echo "=========================================="
echo ""
echo "Port forwards (access from host):"
echo "  SSH:        ssh -p 2222 dev@localhost"
echo "  Frontend:   http://localhost:3000"
echo "  Broker API: http://localhost:8080"
echo "  PostgreSQL: localhost:5432"
echo ""
echo "Login credentials:"
echo "  User: dev"
echo "  Password: dev"
echo ""
echo "Inside VM, run:"
echo "  cd ~/claudetorio/dev"
echo "  docker compose up --build"
echo ""
echo "Press Ctrl+A, then X to exit QEMU"
echo "=========================================="
echo ""

# Run the VM
./result/bin/run-claudetorio-dev-vm "$@"
