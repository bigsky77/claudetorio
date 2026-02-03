# FLE MCP (Factorio Learning Environment)

MCP server for controlling Factorio game state through the Factorio Learning Environment.

## Capabilities

- Read game state (entities, resources, research)
- Execute game commands
- Control player actions
- Manage game sessions

## Configuration

Copy `mcp-config.json` and update with your server details:

- `FLE_SERVER_HOST` - Factorio server IP/hostname
- `FLE_SERVER_PORT` - Server port (default: 34197)
- `FLE_RCON_PASSWORD` - RCON password

## Usage

```bash
# Run the MCP server
./run-mcp.sh

# Or with custom environment
FLE_SERVER_HOST=localhost ./run-mcp.sh
```

## CLAUDE.md

The `CLAUDE.md` file contains instructions for Claude on how to use this MCP effectively when playing Factorio.
