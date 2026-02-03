# FLE Multiplayer Sync Fix

> **NOTE:** This fix has been integrated into the main FLE codebase.
> The canonical implementation is now at:
> `packages/fle/fle/cluster/scenarios/open_world/`
>
> Use `scripts/deploy-scenario.sh` to deploy the join-proof scenario.
> This package is kept for historical reference.

---

## Problem

When FLE (Factorio Learning Environment) runs on a headless server, it injects Lua scripts via RCON that register event handlers:

- `on_tick` (alerts.lua, utils.lua)
- `on_nth_tick(5)` (move_to/server.lua)
- `on_nth_tick(15)` (harvest_resource/server.lua)
- `on_script_path_request_finished` (request_path/server.lua)

When a Factorio client tries to connect, it downloads the save file which contains these event registrations. However, the client has no `control.lua` that registers these events, causing a **script-event-mismatch** error:

```
Error ClientMultiplayerManager.cpp:1169: level was registered for the following events
when the map was saved but has not registered for any events as a result of loading:
on_tick (ID 0) and on_script_path_request_finished (ID 119)

Error ClientMultiplayerManager.cpp:1171: level was registered for the following nth_ticks
when the map was saved but has not registered them as a result of loading: 5 and 15

Error ClientMultiplayerManager.cpp:100: MultiplayerManager failed: multiplayer.script-event-mismatch
```

## Solution

Create a unified scenario with a `control.lua` that:

1. **Pre-registers ALL events** at scenario load time
2. **Calls `global.actions.*` functions** if they exist (populated by FLE via RCON)
3. **Both server and client** use the same scenario, ensuring identical event registrations

## Implementation Steps

### Step 1: Deploy the unified control.lua

Copy `control.lua` to both:
- FLE server scenarios: `/var/claudetorio/fle/fle/cluster/scenarios/open_world/control.lua`
- Stream client scenarios: `/var/claudetorio-stream-server/scenarios/open_world/control.lua`

```bash
# On factorio-server
cp control.lua /var/claudetorio/fle/fle/cluster/scenarios/open_world/control.lua
cp control.lua /var/claudetorio-stream-server/scenarios/open_world/control.lua
```

### Step 2: Modify FLE Lua scripts to NOT re-register events

Apply the patches to prevent FLE scripts from re-registering events:

#### move_to/server.lua
Remove the `script.on_nth_tick(5, ...)` registration at the top of the file.

#### harvest_resource/server.lua
Replace the `script.on_nth_tick(15, ...)` block with a `global.actions.update_harvesting` function definition.

#### request_path/server.lua
Remove the `script.on_event(defines.events.on_script_path_request_finished, ...)` block at the end.

#### mods/alerts.lua
Replace `script.on_event(defines.events.on_tick, on_tick)` with `global.alerts.on_tick = on_tick`

#### mods/utils.lua
Replace `script.on_event(defines.events.on_tick, ...)` with storing the function in `global.utils.on_tick`

### Step 3: Restart the cluster with a fresh save

The existing save files have the old event registrations baked in. You need to:

1. Stop the FLE cluster
2. Delete or move old save files
3. Start the cluster fresh with the new scenario

```bash
# Stop cluster
cd /var/claudetorio/fle && fle cluster stop

# Backup old saves
mv ~/.fle/saves ~/.fle/saves.bak

# Start cluster fresh
fle cluster start -s open_world
```

### Step 4: Restart the stream client

```bash
cd /var/claudetorio-stream-server
docker compose down
docker compose up -d
```

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                     BEFORE (Broken)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Headless Server                    Client                       │
│  ┌─────────────────┐               ┌─────────────────┐          │
│  │ Scenario:       │               │ Scenario:       │          │
│  │ control.lua     │               │ control.lua     │          │
│  │ (empty)         │               │ (empty)         │          │
│  └────────┬────────┘               └────────┬────────┘          │
│           │                                  │                   │
│           ▼                                  ▼                   │
│  ┌─────────────────┐               ┌─────────────────┐          │
│  │ FLE RCON injects│               │ No scripts      │          │
│  │ scripts that    │               │ registered!     │          │
│  │ register:       │               │                 │          │
│  │ - on_tick       │               │ ❌ MISMATCH!    │          │
│  │ - on_nth_tick   │               │                 │          │
│  │ - on_path_req   │               │                 │          │
│  └─────────────────┘               └─────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     AFTER (Fixed)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Headless Server                    Client                       │
│  ┌─────────────────┐               ┌─────────────────┐          │
│  │ Scenario:       │               │ Scenario:       │          │
│  │ control.lua     │               │ control.lua     │          │
│  │ (unified FLE)   │               │ (unified FLE)   │          │
│  │ Pre-registers:  │               │ Pre-registers:  │          │
│  │ - on_tick       │               │ - on_tick       │          │
│  │ - on_nth_tick   │               │ - on_nth_tick   │          │
│  │ - on_path_req   │               │ - on_path_req   │          │
│  └────────┬────────┘               └────────┬────────┘          │
│           │                                  │                   │
│           ▼                                  ▼                   │
│  ┌─────────────────┐               ┌─────────────────┐          │
│  │ FLE RCON injects│               │ Same events     │          │
│  │ global.actions  │               │ registered!     │          │
│  │ (no event       │               │                 │          │
│  │ registration)   │               │ ✅ MATCH!       │          │
│  └─────────────────┘               └─────────────────┘          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Files

- `control.lua` - The unified scenario control file
- `patches/` - Patch descriptions for FLE Lua scripts
- `apply-fix.sh` - Automated script to apply the fix
