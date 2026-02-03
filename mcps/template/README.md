# MCP Template

Use this template to create new MCP servers.

## Setup

1. Copy this directory:
   ```bash
   cp -r mcps/template mcps/my-new-mcp
   ```

2. Rename the example files:
   ```bash
   cd mcps/my-new-mcp
   mv mcp-config.json.example mcp-config.json
   mv CLAUDE.md.example CLAUDE.md
   mv server.py.example server.py
   ```

3. Edit each file to implement your MCP.

## Files

| File | Purpose |
|------|---------|
| `mcp-config.json` | Server configuration |
| `CLAUDE.md` | Instructions for Claude |
| `server.py` | MCP server implementation |
| `run-mcp.sh` | Script to run the server |
| `requirements.txt` | Python dependencies |

## Testing

```bash
# Run the server
./run-mcp.sh

# Or manually
python server.py
```
