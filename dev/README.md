# Local Development

Run the complete ClaudeTorio stack locally for development and testing.

## Prerequisites

- Docker
- Docker Compose v2
- Git

Optional for NixOS VM testing:
- Nix with flakes enabled
- QEMU, VirtualBox, or UTM

## Quick Start

```bash
# One-command setup
./setup.sh

# Or manually:
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY (optional)
docker compose up --build
```

## Services

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Next.js viewer app |
| Broker | http://localhost:8080 | FastAPI session broker |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache and pub/sub |
| Factorio | localhost:34197 (UDP) | Headless game server |

## Development Workflow

```bash
# Start services
docker compose up -d

# View logs
docker compose logs -f broker
docker compose logs -f frontend

# Rebuild after code changes
docker compose up --build broker
docker compose up --build frontend

# Reset database
docker compose down -v
docker compose up -d

# Stop all services
docker compose down
```

## Stream Client (Optional)

The stream client requires a full Factorio installation with graphics.
To enable local stream testing:

1. Install Factorio GUI to `./factorio-client/`
2. Uncomment the `stream-client` service in `docker-compose.yml`
3. Run `docker compose up --build`

## NixOS VM

For testing NixOS configurations:

```bash
# Build VM
nix build ..#nixosConfigurations.dev-vm.config.system.build.vm

# Run VM
./result/bin/run-claudetorio-dev-vm
```

## Environment Variables

See `.env.example` for all available options.

Key variables:
- `ANTHROPIC_API_KEY` - Required to run AI agents
- `POSTGRES_PASSWORD` - Database password (default: dev_password)
- `RCON_PASSWORD` - Factorio RCON password
