# repl-runner Skill

**TRIGGER THIS SKILL** when the user mentions a run_id and wants to interact with Factorio, including: "drive the game", "play Factorio", "run the agent", "control the game", "step through Factorio", "send commands to Factorio", "let's play", or any request to autonomously operate a live Factorio run.

You are now an autonomous Factorio agent. Follow this protocol exactly.

---

## Setup

Working directory: `packages/run-worker/`

Env vars loaded from `packages/run-worker/.env`:
- `SERVER_HOST` — Factorio hostname (default: `localhost`)
- `RCON_PORT` — RCON port (default: `27015`)
- `FLE_RCON_PASSWORD` — **must match** the server's RCON password (NOT `RCON_PASSWORD`)
- `BROKER_URL` — broker API base URL (default: `http://localhost:8080`)
- `RUN_WORKER_API_KEY` — optional, for broker step reporting

---

## Command Format

```bash
cd /home/user/code/projects/randos/claudetorio/packages/run-worker && uv run repl.py <run_id> 2>/dev/null << 'PYEOF'
# python code here
PYEOF
```

- **step_idx is auto-fetched from the broker** (`GET /api/runs/{run_id}` → `step_count`). No need to track it.
- stderr is piped to `/dev/null`; only JSON goes to stdout.

---

## JSON Output Schema

| Field | Type | Meaning |
|---|---|---|
| `step_idx` | int | The step index used |
| `observation` | string | Game state **before** the code ran |
| `observation_after` | string | Game state **after** the code ran |
| `result` | string | stdout from your `print()` calls + error if failed |
| `error_occurred` | bool | `true` if an exception was raised |
| `reward` | float | Step reward delta |
| `production_score` | float | Cumulative production score |
| `achievements` | list | Achievements unlocked this step |
| `vcs` | object | VCS snapshot metadata |

---

## Critical API Corrections

These are **confirmed correct** from live testing — do not use the wrong forms:

### Directions — use ALL CAPS
```python
place_entity(Prototype.StoneFurnace, Direction.UP, Position(x=2, y=0))   # correct
place_entity(Prototype.StoneFurnace, Direction.North, ...)                # WRONG
```

### extract_item — Prototype first, entity second
```python
extract_item(Prototype.IronPlate, furnace, 50)   # correct
extract_item(furnace, Prototype.IronPlate, 50)   # WRONG
```

### `game` is not available — use FLE API directly
```python
print(inspect_inventory())          # correct
print(game.player.position)         # WRONG — NameError
```

### Game speed — use instance methods
```python
instance.set_speed(50)    # speed up before mining/smelting
instance.set_speed(1)     # restore after
# instance.speed(50)      # WRONG — AttributeError
```

### harvest_resource — pass nearest() result, not a raw Position
```python
move_to(nearest(Resource.IronOre))
harvest_resource(nearest(Resource.IronOre), quantity=50)   # correct
```

---

## State Persistence

**Entities persist** between REPL calls (furnaces, machines, chests stay in the world).

**Player inventory resets** on each REPL invocation (FLE reinitialises the player character). Every step starts with an empty inventory — you must re-mine resources each call.

**Implication:** Do all mining → smelting → crafting → placing in a single step. Use `instance.set_speed(50)` to make smelting fast enough to fit within the 60s step timeout.

---

## FLE Python API

These names are pre-imported:

### Movement
```python
move_to(Position(x=10, y=20))
move_to(nearest(Resource.Coal))
move_to(nearest(Resource.IronOre))
move_to(nearest(Resource.Stone))
move_to(nearest(Resource.CopperOre))
```

### Inventory
```python
inventory = inspect_inventory()                    # Inventory object (dict-like)
extract_item(Prototype.IronPlate, entity, 50)      # Prototype first, entity second
insert_item(Prototype.Coal, furnace, 10)
craft_item(Prototype.StoneFurnace, quantity=1)
```

### Entities
```python
entities = get_entities()
furnace = place_entity(Prototype.StoneFurnace, Direction.UP, Position(x=2, y=0))
furnace = get_entity(Prototype.StoneFurnace, Position(x=2, y=0))
```

### Resources
```python
patch = get_resource_patch(Resource.IronOre, Position(x=0, y=0), radius=20)
harvest_resource(nearest(Resource.IronOre), quantity=50)
```

### Game Speed
```python
instance.set_speed(50)    # run game at 50× — use before smelting/waiting
instance.set_speed(1)     # restore normal speed
instance.get_speed()      # check current speed
```

### Inspection
```python
print(inspect_inventory())
print(get_entities())
print(get_resource_patch(Resource.Coal, Position(x=0, y=0), radius=10))
```

---

## Typical Opening Sequence

```python
# Speed everything up from the start
instance.set_speed(50)
import time

# Mining
move_to(nearest(Resource.Stone)); harvest_resource(nearest(Resource.Stone), quantity=10)
move_to(nearest(Resource.IronOre)); harvest_resource(nearest(Resource.IronOre), quantity=80)
move_to(nearest(Resource.Coal)); harvest_resource(nearest(Resource.Coal), quantity=30)

# Craft furnace
craft_item(Prototype.StoneFurnace, quantity=1)

# Place and load — furnace persists between calls so check first
try:
    furnace = get_entity(Prototype.StoneFurnace, Position(x=2, y=0))
except:
    furnace = place_entity(Prototype.StoneFurnace, Direction.UP, Position(x=2, y=0))

insert_item(Prototype.Coal, furnace, 15)
insert_item(Prototype.IronOre, furnace, 80)
time.sleep(4)  # at 50× speed, 4s real = 200s game = 62 iron plates

extract_item(Prototype.IronPlate, furnace, 80)
print("inventory:", inspect_inventory())
instance.set_speed(1)
```

---

## Agent Loop

1. Run probe: `print(inspect_inventory()); print(get_entities())`
2. Read `observation_after` — understand current world state (entities placed, furnace contents)
3. Plan action — remember inventory resets, entities persist
4. Execute — set speed high, mine → smelt → craft → place in one step
5. Parse JSON result
6. If `error_occurred`: fix and retry — the broker only increments `step_count` when a step is reported successfully, so the same idx will be fetched again
7. Continue

---

## VCS Directives

```python
# VCS:TAG:before-power-setup
place_entity(...)
```

| Directive | Effect |
|---|---|
| `# VCS:TAG:name` | Create checkpoint |
| `# VCS:UNDO` | Roll back to previous |
| `# VCS:RESTORE:name` | Jump to named tag |
| `# VCS:HISTORY` | Print recent history |

---

## Error Recovery

1. Read `result` for exception details
2. Just re-run — broker only increments `step_count` on reported success, so the same idx is fetched again automatically
3. After 3 consecutive failures, report to user and pause

---

## Stopping Conditions

- User says "stop", "pause", "done", or "exit"
- Objective achieved
- `production_score` flat for 5+ consecutive steps
- 3+ fatal errors on the same step

**Summary:** steps executed, final `production_score`, key accomplishments, current world state.
