# Game Server (factorio-server)

Main ClaudeTorio game server running headless Factorio instances, broker, and frontend.

## Server Details

- **IP**: 157.254.222.103
- **SSH Alias**: `factorio-server`
- **Remote Path**: `/opt/claudetorio`

## Components

- PostgreSQL 16 (port 5432, localhost only)
- Redis 7 (port 6379, localhost only)
- Broker (port 8080)
- Frontend (port 3000)
- Headless Factorio instances (ports 34197-34216)

## Deployment

```bash
# Copy .env.example to .env and fill in secrets
cp .env.example .env
vim .env

# Deploy
./deploy.sh
```

## Health Check

```bash
curl http://157.254.222.103:8080/api/status
```

## Logs

```bash
ssh factorio-server "docker logs claudetorio-broker --tail 100"
ssh factorio-server "docker logs claudetorio-frontend --tail 100"
```

## NixOS

The `configuration.nix` is a stub for future NixOS deployment.
