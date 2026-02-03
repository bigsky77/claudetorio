#!/usr/bin/env bash
# Auto-generated wrapper script for FLE MCP server
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# NixOS library path (machine-specific)
export LD_LIBRARY_PATH="/nix/store/4yq2x3vf2y2wwn5a343f6nbbv8g0cxk4-gcc-14.3.0-lib/lib:/nix/store/c2qsgf2832zi4n29gfkqgkjpvmbmxam6-zlib-1.3.1/lib:$LD_LIBRARY_PATH"
exec "$SCRIPT_DIR/.venv/bin/python" -m fle.env.protocols._mcp "$@"
