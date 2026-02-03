# Claudetorio

**Run lots of headless worlds cheaply. Attach a high-fidelity viewport only when a human cares.**

Build the largest Factorio factory ever. Autonomously.

---

## The Idea

AI agents are getting good at complex, long-horizon reasoning tasks. But how do you actually *see* them think? How do you evaluate reasoning that unfolds over hours or days?

**Factorio is the answer.** It's a game about building automated factories - logistics, optimization, scaling, debugging. The kind of messy, compound problem-solving that separates real intelligence from pattern matching.

Claudetorio lets you:
- **Run 20+ autonomous AI games 24/7** on cheap headless servers
- **Watch any game in real-time** by attaching a GPU-rendered viewport on demand
- **Evaluate AI reasoning through gameplay** - no synthetic benchmarks, just building factories

The key insight: **decouple simulation from rendering**. Simulations are cheap (CPU). Rendering is expensive (GPU). Only render when someone's watching.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: SIMULATION (cheap, many)                               │
│  20 headless Factorio servers running AI agents continuously    │
│  ~$0.02/hour per game                                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ attach on-demand
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 2: RENDERING (expensive, few)                             │
│  GPU-powered Factorio client + WebRTC streaming                 │
│  Only spins up when a human wants to watch                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              │ WebRTC
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  TIER 3: VIEWING (free, unlimited)                              │
│  Browser-based viewing, no install required                     │
└─────────────────────────────────────────────────────────────────┘
```

This means you can run 100 AI experiments but only pay for rendering when you're actually watching one.

---

## What's Running

| Component | What it does |
|-----------|--------------|
| **20 Factorio servers** | Headless games running via [FLE](https://github.com/JackHopkins/factorio-learning-environment) |
| **Session broker** | Manages games, tracks scores, assigns viewports |
| **Leaderboard frontend** | See all running games, click to watch |
| **Stream client** | KasmVNC-based Factorio GUI that connects to any game |

Live at: `http://157.254.222.103:3000` (when running)

---

## Quick Start

```bash
# Clone
git clone https://github.com/bigsky77/claudetorio.git
cd claudetorio

# Local dev (runs everything in Docker)
cd dev
cp .env.example .env
docker compose up --build

# Access
open http://localhost:3000     # Leaderboard
open http://localhost:3002     # Stream viewer
```

---

## Repository Structure

```
claudetorio/
├── packages/
│   ├── broker/           # FastAPI - session management, RCON integration
│   ├── frontend/         # Next.js - leaderboard, stream viewer
│   ├── stream-client/    # KasmVNC + Factorio GUI container
│   ├── fle/              # Factorio Learning Environment
│   └── fle-scenario-fix/ # Multiplayer compatibility patches
├── machines/
│   ├── game-server/      # Deployment for simulation server
│   └── stream-server/    # Deployment for rendering server
├── mcps/                 # MCP servers for Claude Code integration
└── docs/                 # Architecture documentation
```

---

## Research

Built on the [Factorio Learning Environment](https://github.com/JackHopkins/factorio-learning-environment) - a non-saturating benchmark for evaluating LLM agents on complex, long-horizon tasks.

Key paper: [Factorio Learning Environment](https://arxiv.org/pdf/2503.09617)

---

## Status

**Prototype** - Running 20 game slots, single stream client, basic leaderboard.

Next: Multi-viewer support, dynamic stream allocation, public demo.

---

*We're attacking the hardest benchmark we know of, and we're doing it in the open.*
