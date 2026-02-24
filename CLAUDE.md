# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Claudetorio orchestrates autonomous LLM agents playing Factorio 24/7. The key design principle is separating cheap headless simulation (CPU-only Factorio servers) from expensive rendering (GPU-backed HLS streams), with streams spawned on demand.

## Quickstart — Frontend Dev Against Production

The fastest way to work on the frontend. No Docker, no local broker/postgres/redis. Just the Next.js dev server talking to the production API.

```bash
# 1. Make sure nothing heavy is running locally
docker compose -f dev/docker-compose.yml down -v 2>/dev/null  # stop local stack if running

# 2. Set frontend to use production API
cat > packages/frontend/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=https://app.claudetorio.ai
NEXT_PUBLIC_STREAM_URL=https://stream.claudetorio.ai
EOF

# 3. Start dev server
cd packages/frontend
npm run dev    # → http://localhost:3000
```

**Key pages:**
- `http://localhost:3000` — home page, auto-discovers live runs
- `http://localhost:3000/live` — lightweight live stream viewer (minimal polling)
- `http://localhost:3000/run/{runId}` — full run detail (heavier: step log + chat polling)

**API shortcut:** `curl https://app.claudetorio.ai/api/runs/live` — returns the current live run or 404.

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

# Tear down (stop orphan containers first — broker spawns run-workers and headless
# Factorio containers outside of compose, so they must be stopped manually)
docker ps --filter name=run-worker --filter name=factorio --filter name=stream-worker -q | xargs -r docker stop
docker compose -f dev/docker-compose.yml down -v
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
# Optional: MODEL=claude-opus-4-5 CUSTOM_API=true CUSTOM_API_URL=... CUSTOM_API_KEY=...
```

### Stream Agent (local, no Docker)
```bash
cd packages/stream-agent
STREAM_AGENT_KEY=dev DOCKER_NETWORK=stream-network uvicorn main:app --host 0.0.0.0 --port 8090 --reload
```

There are no Python unit tests. Infrastructure tests are Nix-only (`tests/factorio-server.nix`, `tests/integration.nix`).

## Architecture

Production splits across two servers; dev runs everything locally via `dev/docker-compose.yml`.

```
game-server (157.254.222.103)
  ├── broker (8080)           ← spawns game containers; calls stream-agent for stream-clients
  ├── postgres + redis
  ├── frontend (3000)
  ├── factorio-{slot}         ← headless, UDP exposed to host
  ├── run-worker-{run_id}     ← LLM agent loop
  ├── factorio-replay-{run_id} ← UDP + RCON exposed to host
  └── stream-worker-{run_id}  ← replays steps via RCON to local factorio-replay

stream-server (157.254.222.104)
  ├── caddy (80/443)          ← TLS; routes :{STREAM_BASE_PORT+slot} → stream-client-{slot}:3000
  ├── stream-agent (8090)     ← HTTP API: spawn/stop stream-client containers on this daemon
  └── stream-client-{slot}    ← FFmpeg→HLS→nginx; UDP to game-server:34197+slot
  └── stream-client-replay-{run_id}  ← FFmpeg→HLS→nginx; UDP to game-server:35100+slot
```

The broker mounts `/var/run/docker.sock` and uses `docker run` to spawn game containers. Stream-client containers are spawned via HTTP to stream-agent (when `STREAM_AGENT_URL` is set) so they land on stream-server's Docker daemon. In dev, `STREAM_AGENT_URL` is unset and stream-clients are spawned locally.

**Named volumes for dynamic spawning:** `claudetorio_factorio_config`, `claudetorio_factorio_scenarios`, and `claudetorio_factorio_client` are pre-populated by Alpine init containers so dynamically-spawned `docker run` containers can mount config/assets without host paths.

## Run Lifecycle

1. `POST /api/runs` → broker allocates a slot, spawns `factorio-{slot}`, waits for RCON, returns `status=waiting`
2. `POST /api/runs/{id}/start-worker` → broker spawns `run-worker-{run_id}` Docker container, status=`running`
3. run-worker: LLM observe-think-act loop, reports each step via `POST /api/runs/{id}/steps`
4. run-worker exits → `_monitor_run` updates DB status to `completed`/`failed`, releases slot lock, stops Factorio
5. `POST /api/runs/{id}/replay` → spawns `factorio-replay-{run_id}` + `stream-client-replay-{run_id}` (via stream-agent in prod) + `stream-worker-{run_id}`; stream-worker fetches all DB steps and re-executes them at STEP_INTERVAL pace
6. `DELETE /api/runs/{id}/replay` → stops all three replay containers

## Port Conventions

| Resource | Formula | Default base |
|----------|---------|------|
| Live Factorio UDP | `BASE_UDP_PORT + slot` | 34197 |
| Live Factorio RCON | `BASE_RCON_PORT + slot` | 27000 (dev: 27015) |
| Live stream (HLS/nginx) | `STREAM_BASE_PORT + slot` | 3002 (dev) / 3003 (prod) |
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
      streaming.py           # spawn_stream_client (local or via stream-agent)
      replay.py              # All replay container lifecycle functions
      slots.py               # Redis slot lock management
      rcon.py                # RCON helpers
    tasks.py                 # Background: score_polling_loop, session_timeout_checker
```

`AppState` (in `state.py`) stores the redis connection, `run_processes` dict (active `asyncio.subprocess.Process` for monitoring), and `active_replays` dict keyed by run_id. The lifespan starts two background tasks: `score_polling_loop` (periodic production score scraping) and `session_timeout_checker` (kills stale sessions).

## FLE (Factorio Learning Environment)

`packages/fle/` is a vendored copy of the FLE library (also on PyPI). It wraps Factorio's RCON interface for LLM agent use:

- **`FactorioInstance`** (`fle/env/instance.py`) — RCON connection; `eval(code)` executes Lua in the game
- **`FactorioGymEnv`** (`fle/env/gym_env/`) — gym.Env interface: `get_observation()` → formatted game state text; `step(Action)` → executes code, returns reward/info
- **`APIFactory`** (`fle/agents/llm/`) — multi-provider LLM dispatch (Anthropic, OpenAI-compatible); `acall()` is patched in run-worker to limit retries to 3 (default is infinite)

**VCS directives:** The LLM can embed `# VCS: UNDO`, `# VCS: TAG name`, `# VCS: RESTORE name`, or `# VCS: HISTORY` comments in generated code. The run-worker intercepts these before calling `eval()` and routes them to `FactorioMCPRepository` for game-state version control.

## Stream Client

`packages/stream-client/` runs Xvfb + Openbox + Factorio client + FFmpeg + nginx in a single container. Startup order is orchestrated by `entrypoint.sh`:

1. Xvfb starts a virtual display
2. Openbox provides a window manager
3. `scripts/start-factorio.sh` launches the Factorio client (connects to `SERVER_HOST:SERVER_PORT`)
4. FFmpeg x11grabs the display and writes HLS segments to `/tmp/hls/` (`-draw_mouse 0` hides the cursor)
5. nginx serves `/tmp/hls/stream.m3u8` + `.ts` segments on port 3000, plus a standalone `index.html` hls.js player at `/`

The stream-agent waits for port 3000 then polls `docker exec test -f /tmp/hls/stream.m3u8` before declaring the container ready.

## Other Packages

- **`packages/stream-worker/`** — replays recorded steps into a fresh Factorio instance via RCON at `STEP_INTERVAL` pace; sends `follow_agent` camera commands after each step. Key env vars: `STEP_INTERVAL` (default 5s), `POLL_INTERVAL` (default 10s), `CAMERA_ZOOM` (default 0.5).
- **`packages/agent-runner/`** — standalone scripts (`connect.sh`, `disconnect.sh`, `status.sh`) for opening an SSH tunnel to the game-server and running an agent locally against production.
- **`mcps/fle-mcp/`** — MCP server exposing Factorio control tools (render, execute, etc.) so Claude Code can directly interact with a running game.
- **`packages/fle-scenario-fix/`** — historical patch that fixed a multiplayer desync: FLE registers RCON event handlers at runtime, but clients joining mid-session can't deserialize them. Fix pre-populates `control.lua` with all registrations. Now integrated into `packages/fle/`.

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

**Important:** In `run-worker/main.py`, `load_dotenv()` must be called before any FLE imports — FLE reads env vars at module import time.

## Factorio Save Strategy

Factorio servers are started with a **vanilla save** (`--create`), not the `open_world` scenario. The open_world scenario's `control.lua` registers global event handlers that can't be serialized — when a multiplayer client joins after FLE init, those Lua functions are nil, causing instant desyncs. FLE loads everything via RCON, which is replicated to all peers.

## Frontend Architecture

- **App Router** (Next.js 16): pages under `app/`, API proxy routes under `app/api/`
- `app/api/runs/[runId]/*/route.ts` — proxy to broker with `BROKER_ADMIN_KEY` header; never expose the key to the browser
- `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_STREAM_URL` are inlined at **build time** (Docker `ARG`); changing them requires a rebuild
- Client components poll run/step state via `useRunPolling` hook
- `StreamPanel` renders an hls.js `<video>` element from the replay `stream_url`; appends `/stream.m3u8` to the base URL
- `stream_url` on `RunInfo` is only populated when a replay is active (`app_state.active_replays[run_id]`); live runs no longer auto-spawn a stream client

## Key Environment Variables

For the broker (see `dev/docker-compose.yml` for dev values):

| Variable | Purpose |
|----------|---------|
| `FACTORIO_IMAGE` | Required — Factorio server image (e.g. `factoriotools/factorio:1.1.110`) |
| `FACTORIO_CLIENT_VOLUME` | Docker volume with Factorio client files (for stream-client in dev; unused in prod — stream-agent has its own) |
| `DOCKER_NETWORK` | Network for spawned game containers |
| `BROKER_ADMIN_KEY` | Auth header for admin endpoints |
| `RUN_WORKER_API_KEY` | Auth for run-worker → broker reporting |
| `STREAM_WORKER_IMAGE` | Image name for stream-worker containers |
| `RCON_PASSWORD` | Shared RCON password across all Factorio containers |
| `STREAM_AGENT_URL` | e.g. `http://157.254.222.104:8090` — when set, stream-clients are spawned on stream-server via HTTP instead of locally |
| `STREAM_AGENT_KEY` | Shared secret for broker ↔ stream-agent auth |
| `GAME_SERVER_PUBLIC_HOST` | Public IP of game-server (passed to stream-agent so stream-clients know where to connect) |

For run-worker:

| Variable | Purpose |
|----------|---------|
| `MODEL` | LLM model name (default: `claude-sonnet-4-5-20250929`) |
| `CUSTOM_API` | Set to `true` to use a custom OpenAI-compatible API |
| `CUSTOM_API_URL` / `CUSTOM_API_KEY` | Endpoint + key for custom API |

For stream-worker:

| Variable | Purpose |
|----------|---------|
| `STEP_INTERVAL` | Seconds to wait between replayed steps (default: 5.0) |
| `POLL_INTERVAL` | Seconds to wait when no new steps are available (default: 10.0) |
| `CAMERA_ZOOM` | `zoom_to_world` zoom level for spectators (default: 0.5) |

**Production stream URL routing:** When `STREAM_DOMAIN` is set on the broker, Caddy on stream-server routes by subdomain — `c{slot}.{STREAM_DOMAIN}` for live streams and `cr{slot}.{STREAM_DOMAIN}` for replay streams (requires a wildcard TLS cert). In dev, port-based routing is used instead (`{STREAM_URL}:{STREAM_BASE_PORT+slot}`).

## Deployment

Push to `main` triggers GitHub Actions (`.github/workflows/deploy.yml`):
- Changes in `packages/{broker,frontend,fle,run-worker,stream-worker}/` or `machines/game-server/` → deploy to **game-server**
- Changes in `packages/{stream-client,stream-agent}/` or `machines/stream-server/` → deploy to **stream-server**

Manual deploy scripts: `machines/game-server/deploy.sh` and `machines/stream-server/deploy.sh`.

Infrastructure (NixOS machine config + firewall rules) is in `machines/game-server/configuration.nix` and `machines/stream-server/configuration.nix`.
