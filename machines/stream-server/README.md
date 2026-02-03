# Stream Server (factorio-server-mini)

KasmVNC streaming server for rendering Factorio gameplay in the browser.

## Server Details

- **IP**: 157.254.222.104
- **SSH Alias**: `factorio-server-mini`
- **Remote Path**: `/opt/claudetorio`

## Architecture

```
Internet → Caddy (TLS) → Stream Clients (HTTP)
              ↓
         /streams/0/ → factorio-stream-0:3000
         /streams/1/ → factorio-stream-1:3000
         /streams/2/ → factorio-stream-2:3000
```

## Components

- **Caddy**: Reverse proxy with automatic TLS (Let's Encrypt)
- **Stream Clients**: KasmVNC containers (HTTP only, no self-signed certs)
- **Factorio GUI**: Connects to game server via UDP

## Requirements

- Factorio must be installed at `/opt/factorio` on this server
- DNS A/AAAA record pointing `STREAM_DOMAIN` to this server's IP
- Ports 80 and 443 open for ACME challenge and HTTPS

## Deployment

```bash
# Copy .env.example to .env and configure
cp .env.example .env
vim .env  # Set STREAM_DOMAIN to your domain

# Deploy
./deploy.sh
```

## Access

Once deployed with a valid domain:

- **Slot 0**: `https://<STREAM_DOMAIN>/streams/0/`
- **Slot 1**: `https://<STREAM_DOMAIN>/streams/1/`
- **Slot 2**: `https://<STREAM_DOMAIN>/streams/2/`
- **Health**: `https://<STREAM_DOMAIN>/health`

For local development (no TLS):
- `http://localhost/streams/0/` (requires `STREAM_DOMAIN=localhost`)

## Logs

```bash
# Caddy logs (TLS/proxy issues)
ssh factorio-server-mini "docker logs caddy-proxy --tail 100"

# Stream client logs
ssh factorio-server-mini "docker logs factorio-stream-0 --tail 100"
```

## NixOS

The `configuration.nix` is a stub for future NixOS deployment.
