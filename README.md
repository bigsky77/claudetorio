# Claudetorio

**Run lots of headless worlds cheaply. Attach a high-fidelity viewport only when a human cares.**

Build the largest Factorio factory ever. Autonomously.

---

## The Idea

AI agents are getting good at complex, long-horizon reasoning tasks. But how do you actually *see* them think? How do you evaluate reasoning that unfolds over hours or days?

**Factorio is the answer.** It's a game about building automated factories - logistics, optimization, scaling, debugging. The kind of messy, compound problem-solving that separates real intelligence from pattern matching.

Claudetorio lets you:
- **Run 20+ autonomous AI games 24/7** on cheap headless servers
- **Replay any run** by re-executing recorded agent steps in a fresh instance with a GPU-rendered viewport
- **Evaluate AI reasoning through gameplay** - no synthetic benchmarks, just building factories

The key insight: **decouple simulation from rendering**. Simulations are cheap (CPU). Rendering is expensive (GPU). Only render when someone's watching.

---

## Architecture

Production splits across two servers:

```
game-server
  ├── broker (8080)              ← orchestrates runs; spawns all game containers
  ├── postgres + redis
  ├── frontend (3000)
  ├── factorio-{slot}            ← headless Factorio, one per live run
  ├── run-worker-{run_id}        ← LLM observe-think-act loop
  ├── factorio-replay-{run_id}   ← isolated Factorio for replaying a past run
  └── stream-worker-{run_id}     ← re-executes recorded steps into factorio-replay

stream-server
  ├── caddy (80/443)             ← TLS + subdomain routing to stream-clients
  ├── stream-agent (8090)        ← HTTP API: spawn/stop stream-client containers
  └── stream-client-replay-{id}  ← KasmVNC viewer connecting to factorio-replay
```

The key split: headless simulation runs on the game-server (CPU-only). KasmVNC rendering only spins up on the stream-server when a replay is triggered.

---

## Run Lifecycle

1. `POST /api/runs` → broker allocates a slot, spawns a headless Factorio, returns `status=waiting`
2. `POST /api/runs/{id}/start-worker` → broker spawns a `run-worker` container; LLM agent loop begins
3. run-worker executes Lua via RCON, reports each step to the broker
4. run-worker exits → broker marks run `completed`/`failed`, releases the slot
5. `POST /api/runs/{id}/replay` → spawns an isolated Factorio + KasmVNC stream-client + stream-worker; stream-worker re-executes all recorded steps
6. Browser opens the KasmVNC iframe to watch the replay

---

## Repository Structure

```
claudetorio/
├── packages/
│   ├── broker/           # FastAPI — run orchestration, RCON, slot management
│   ├── frontend/         # Next.js — run list, step viewer, replay stream panel
│   ├── run-worker/       # LLM agent loop (observe → think → act)
│   ├── stream-worker/    # Replay executor: re-runs steps into factorio-replay
│   ├── stream-agent/     # HTTP API on stream-server for spawning stream-clients
│   ├── stream-client/    # KasmVNC + Factorio GUI container image
│   ├── fle/              # Vendored Factorio Learning Environment
│   ├── fle-scenario-fix/ # Historical multiplayer desync patch (now in fle/)
│   └── agent-runner/     # Scripts for running an agent locally via SSH tunnel
├── mcps/
│   └── fle-mcp/          # MCP server for Claude Code ↔ Factorio interaction
├── machines/
│   ├── game-server/      # NixOS config + docker-compose for game-server
│   └── stream-server/    # NixOS config + docker-compose for stream-server
├── dev/
│   └── docker-compose.yml  # Full local stack (both servers simulated)
└── tests/                # Nix integration tests
```

---

## Quick Start (Local Dev)

```bash
# 1. Build broker-spawned images first
docker compose -f dev/docker-compose.yml build stream-client run-worker stream-worker

# 2. Start core services
docker compose -f dev/docker-compose.yml up broker frontend postgres redis

# 3. Access
open http://localhost:3000   # Frontend
```

See `CLAUDE.md` for full development commands and architecture details.

---

## Research

Key paper: [Factorio Learning Environment](https://arxiv.org/pdf/2503.09617)

---

*We're attacking the hardest benchmark we know of, and we're doing it in the open.*
