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

### Rebuild Policy (Pinned Base Image)

- `packages/stream-client/Dockerfile` pins `ghcr.io/linuxserver/baseimage-kasmvnc` by digest.
- Do not switch back to a floating tag (`:ubuntunoble`) in production.
- When upgrading, update the digest intentionally, rebuild, then redeploy.

### Explicit Stream-Client Rebuild / Redeploy

```bash
cd /opt/claudetorio/machines/stream-server

# Rebuild stream-client from the currently pinned digest
docker compose --profile build-only build stream-client

# Refresh Factorio client volume and restart stack
docker compose run --rm factorio-client-init
docker compose up --build -d
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

## Production Diagnostics

```bash
# 1) stream-agent health
curl -sf http://localhost:8090/health

# 2) stream-client logs
docker logs stream-client-<slot> --tail 200

# 3) DISPLAY is set in the stream-client container
docker exec stream-client-<slot> env | grep DISPLAY

# 4) Factorio binary exists and is executable
docker exec stream-client-<slot> ls -l /opt/factorio/bin/x64/factorio

# 5) Confirm launch marker appears in logs
docker logs stream-client-<slot> --tail 300 | grep -E "\\[factorio-launch\\]|Factorio Stream Client"
```

## NixOS

The `configuration.nix` is a stub for future NixOS deployment.
