# MCP Servers (Plugin Architecture)

Model Context Protocol servers for extending ClaudeTorio's capabilities.

## Available MCPs

| MCP | Description |
|-----|-------------|
| `fle-mcp` | Factorio Learning Environment - Control Factorio game state |

## Structure

Each MCP directory contains:

```
mcps/<mcp-name>/
├── mcp-config.json    # MCP server configuration
├── server.py          # MCP server entry point (optional)
├── CLAUDE.md          # Instructions for Claude when using this MCP
├── run-mcp.sh         # Script to run the MCP server
├── requirements.txt   # Python dependencies (if any)
└── README.md          # Documentation
```

## Adding a New MCP

1. Copy the template:
   ```bash
   cp -r mcps/template mcps/my-new-mcp
   ```

2. Edit the configuration:
   ```bash
   vim mcps/my-new-mcp/mcp-config.json
   ```

3. Implement your server or wrapper:
   ```bash
   vim mcps/my-new-mcp/server.py
   ```

4. Write Claude instructions:
   ```bash
   vim mcps/my-new-mcp/CLAUDE.md
   ```

5. Test locally:
   ```bash
   cd mcps/my-new-mcp
   ./run-mcp.sh
   ```

## MCP Config Format

```json
{
  "name": "my-mcp",
  "description": "Description of what this MCP does",
  "version": "1.0.0",
  "server": {
    "command": "python",
    "args": ["server.py"],
    "cwd": "."
  },
  "environment": {
    "MY_VAR": "${MY_VAR}"
  },
  "capabilities": [
    "capability_1",
    "capability_2"
  ]
}
```

## Using with Claude Code

Add the MCP to your Claude Code configuration:

```json
{
  "mcpServers": {
    "fle": {
      "command": "/path/to/mcps/fle-mcp/run-mcp.sh"
    }
  }
}
```
