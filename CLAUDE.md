# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Claudetorio orchestrates autonomous LLM agents playing Factorio 24/7. The key design principle is separating cheap headless simulation (CPU-only Factorio servers) from expensive rendering (GPU-backed KasmVNC streams), with streams spawned on demand.

## Common Commands

### Full Local Stack
```bash
# Build all broker-spawned images first (required before broker can run)
docker compose -f dev/docker-compose.yml build stream-client run-worker stream-worker

# Start core services (broker, frontend, postgres, redis)
docker compose -f dev/docker-compose.yml up broker frontend postgres redis

# Rebuild a specific image after code changes
docker compose -f dev/docker-compose.yml build run-worker
docker compose -f dev/docker-compose.yml build stream-worker
```

### Frontend
```bash
cd packages/frontend
npm run dev          # dev server on :3000
npm run lint         # ESLint
npx tsc --noEmit    # type-check without building
```

### Broker (local, no Docker)
```bash
cd packages/broker
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

### Run Worker (local)
```bash
cd packages/run-worker
uv sync
RUN_ID=... BROKER_URL=... SERVER_HOST=... RCON_PORT=... RCON_PASSWORD=... uv run python main.py
```

There are no Python unit tests. Infrastructure tests are Nix-only (`tests/factorio-server.nix`, `tests/integration.nix`).

## Architecture

```
Browser
  └── Frontend (Next.js :3000)
        └── Broker API (FastAPI :8080)
              ├── PostgreSQL (state)
              ├── Redis (slot locks)
              └── Docker socket (spawns all game containers)
                    ├── factorio-{slot}          ← headless game server
                    ├── run-worker-{run_id}       ← LLM agent loop
                    ├── factorio-replay-{run_id}  ← replay game server (on demand)
                    ├── stream-client-replay-{run_id} ← KasmVNC stream
                    └── stream-worker-{run_id}    ← replay step replayer
```

The broker mounts `/var/run/docker.sock` and uses `docker run` to spawn all child containers — they are **not** compose services. Only broker, frontend, postgres, and redis run as compose services.

## Run Lifecycle

1. `POST /api/runs` → broker allocates a slot, spawns `factorio-{slot}`, waits for RCON, returns `status=waiting`
2. `POST /api/runs/{id}/start-worker` → broker spawns `run-worker-{run_id}` Docker container, status=`running`
3. run-worker: LLM observe-think-act loop, reports each step via `POST /api/runs/{id}/steps`
4. run-worker exits → `_monitor_run` updates DB status to `completed`/`failed`, releases slot lock, stops Factorio
5. `POST /api/runs/{id}/replay` → spawns `factorio-replay-{run_id}` + `stream-client-replay-{run_id}` + `stream-worker-{run_id}`; stream-worker fetches all DB steps and re-executes them at STEP_INTERVAL pace
6. `DELETE /api/runs/{id}/replay` → stops all three replay containers

## Port Conventions

| Resource | Formula | Default base |
|----------|---------|------|
| Live Factorio UDP | `BASE_UDP_PORT + slot` | 34197 |
| Live Factorio RCON | `BASE_RCON_PORT + slot` | 27000 (dev: 27015) |
| Live stream (KasmVNC) | `STREAM_BASE_PORT + slot` | 3002 (dev) |
| Replay Factorio UDP | `REPLAY_UDP_BASE_PORT + slot` | 35100 |
| Replay Factorio RCON | `REPLAY_RCON_BASE_PORT + slot` | 28000 |
| Replay stream | `REPLAY_STREAM_BASE_PORT + slot` | 4002 |

Slots 0-19 are used for live runs; slots 0-4 are used for replays (independent ranges).

## Broker Package Layout

```
packages/broker/
  main.py                    # uvicorn entry: create_app()
  app/
    __init__.py              # FastAPI app factory, lifespan, CORS
    config.py                # Config class (all env vars + port helpers)
    state.py                 # AppState: redis, run_processes, active_replays
    models.py                # SQLAlchemy: Run, RunStep, Session, User (legacy)
    schemas.py               # Pydantic request/response models
    dependencies.py          # get_db, get_app_state, require_admin_key
    routes/
      runs.py                # /api/runs/* — main run + replay management
      sessions.py            # /api/session/* — legacy session API
      leaderboard.py         # /api/leaderboard
      system.py              # /api/status, /api/health
      internal.py            # Internal run-worker reporting endpoints
    services/
      factorio.py            # spawn_factorio, wait_for_factorio, stop_factorio
      streaming.py           # spawn_stream_client, wait_for_stream_client
      replay.py              # All replay container lifecycle functions
      slots.py               # Redis slot lock management
      rcon.py                # RCON helpers
    tasks.py                 # Background: score_polling_loop, session_timeout_checker
```

## RCON Warmup Pattern

Any Python worker that connects FLE to a fresh Factorio server **must** do this before calling `FactorioInstance(...)`:

```python
# 1. Dismiss the "achievements will be disabled" warning (first /sc is swallowed)
from factorio_rcon import RCONClient as _WarmupRCON
_warmup = _WarmupRCON(host, rcon_port, password)
_warmup.send_command("/sc rcon.print('warmup')")
_warmup.send_command("/sc rcon.print('warmup')")
_warmup.close()

# 2. Patch RCONClient to prevent double-connect (FLE calls connect() after __init__)
from factorio_rcon import RCONClient as _OrigRCON
_orig_init = _OrigRCON.__init__
def _patched_init(self, ip, port, pw, timeout=None, connect_on_init=False):
    _orig_init(self, ip, port, pw, timeout=timeout, connect_on_init=connect_on_init)
_OrigRCON.__init__ = _patched_init

# 3. Then init FLE
instance = FactorioInstance(address=host, tcp_port=rcon_port, fast=True, ...)
```

This pattern appears in both `run-worker/main.py:427-457` and `stream-worker/main.py`.

## Factorio Save Strategy

Factorio servers are started with a **vanilla save** (`--create`), not the `open_world` scenario. The open_world scenario's `control.lua` registers global event handlers that can't be serialized — when a multiplayer client joins after FLE init, those Lua functions are nil, causing instant desyncs. FLE loads everything via RCON, which is replicated to all peers.

## Frontend Architecture

- **App Router** (Next.js 16): pages under `app/`, API proxy routes under `app/api/`
- `app/api/runs/[runId]/*/route.ts` — proxy to broker with `BROKER_ADMIN_KEY` header; never expose the key to the browser
- `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_STREAM_URL` are inlined at **build time** (Docker `ARG`); changing them requires a rebuild
- Client components poll run/step state via `useRunPolling` hook
- `StreamPanel` renders a KasmVNC iframe from the replay `stream_url`
- `stream_url` on `RunInfo` is only populated when a replay is active (`app_state.active_replays[run_id]`); live runs no longer auto-spawn a stream client

## Key Environment Variables

For the broker (see `dev/docker-compose.yml` for dev values):

| Variable | Purpose |
|----------|---------|
| `FACTORIO_IMAGE` | Required — Factorio server image (e.g. `factoriotools/factorio:1.1.110`) |
| `FACTORIO_CLIENT_VOLUME` | Docker volume with Factorio client files (for stream-client) |
| `DOCKER_NETWORK` | Network for spawned containers to reach each other |
| `BROKER_ADMIN_KEY` | Auth header for admin endpoints |
| `RUN_WORKER_API_KEY` | Auth for run-worker → broker reporting |
| `STREAM_WORKER_IMAGE` | Image name for stream-worker containers |
| `RCON_PASSWORD` | Shared RCON password across all Factorio containers |

## Deployment

Push to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`):
- Changes in `packages/{broker,frontend,fle,run-worker,stream-worker}/` → deploy to **game-server**
- Changes in `packages/stream-client/` → deploy to **stream-server**

Manual deploy scripts are in `scripts/`. Infrastructure (NixOS machines) is in `machines/`.
