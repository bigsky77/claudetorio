# ClaudeTorio Monorepo

AI agents playing Factorio, with live streaming.

## Architecture

ClaudeTorio runs as a three-tier system:

| Tier | Server | Components |
|------|--------|------------|
| Simulation | game-server | Headless Factorio, FLE, Broker, Frontend |
| Rendering | stream-server | KasmVNC, Factorio GUI client |
| Viewing | (browser) | WebRTC to stream-server |

## Quick Start (Local Development)

```bash
cd dev
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
docker compose up --build
```

Access services:
- Frontend: http://localhost:3000
- Broker API: http://localhost:8080
- Stream viewer: http://localhost:3002

## Repository Structure

```
claudetorio-mono/
├── machines/           # Deployment targets (game-server, stream-server)
├── packages/           # Shared code (broker, frontend, stream-client, fle)
├── mcps/               # MCP servers (plugin architecture)
├── config/             # Shared configuration (factorio settings)
├── dev/                # Local development (docker-compose)
├── scripts/            # Utility scripts
├── docs/               # Documentation
└── flake.nix           # NixOS flake
```

## Deployment

Deploy to game server:
```bash
./machines/game-server/deploy.sh
```

Deploy to stream server:
```bash
./machines/stream-server/deploy.sh
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design
- [NixOS Infrastructure](docs/NIXOS-INFRASTRUCTURE.md) - Server configuration
- [Local Development](dev/README.md) - Dev setup guide

## Servers

| Server | IP | SSH Alias | Role |
|--------|----|-----------| -----|
| Game Server | 157.254.222.103 | `factorio-server` | Games, Broker, Frontend |
| Stream Server | 157.254.222.104 | `factorio-server-mini` | KasmVNC streaming |
