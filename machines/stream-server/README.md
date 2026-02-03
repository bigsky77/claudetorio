# Stream Server (factorio-server-mini)

KasmVNC streaming server for rendering Factorio gameplay in the browser.

## Server Details

- **IP**: 157.254.222.104
- **SSH Alias**: `factorio-server-mini`
- **Remote Path**: `/opt/claudetorio`

## Components

- KasmVNC stream client (ports 3002 HTTP, 3003 HTTPS)
- Factorio GUI client (connects to game server)

## Requirements

Factorio must be installed at `/opt/factorio` on this server.

## Deployment

```bash
# Copy .env.example to .env and fill in secrets
cp .env.example .env
vim .env

# Deploy
./deploy.sh
```

## Access

- HTTP: http://157.254.222.104:3002
- HTTPS: https://157.254.222.104:3003

## Logs

```bash
ssh factorio-server-mini "docker logs factorio-stream --tail 100"
```

## NixOS

The `configuration.nix` is a stub for future NixOS deployment.
