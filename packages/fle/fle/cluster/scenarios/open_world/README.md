# FLE Join-Proof Scenario: open_world

This scenario implements a **join-proof** runtime for Factorio Learning Environment (FLE), ensuring that viewer clients can join any running headless game without `script-event-mismatch` errors.

## Problem Solved

When running multiple headless Factorio servers with on-demand viewer clients:
- Headless servers register event handlers dynamically (via RCON-injected Lua)
- Joining clients load the save but cannot recreate these dynamic registrations
- Factorio refuses the connection with `multiplayer.script-event-mismatch`

## Solution

**All event registrations happen in `control.lua` at scenario load time**, not dynamically via RCON. The FLE tools populate `global.actions.*` functions which the pre-registered event handlers call.

## Files

| File | Purpose |
|------|---------|
| `control.lua` | Main scenario with all event registrations |
| `version.lua` | Runtime version tracking |
| `commands.lua` | Optional command queue for deterministic processing |
| `README.md` | This documentation |

## Events Registered

The following events are pre-registered in `control.lua`:

- `on_tick` - Used by alerts, crafting queue, command queue draining
- `on_nth_tick(5)` - Used by move_to for walking queue updates
- `on_nth_tick(15)` - Used by harvest_resource for mining updates
- `on_script_path_request_finished` - Used by request_path for pathfinding
- `on_player_joined_game` - For join notifications

## How It Works

1. **Scenario loads** → `control.lua` registers all events
2. **FLE initializes** → RCON injects tool scripts that populate `global.actions.*`
3. **Event fires** → Pre-registered handler calls `global.actions.X()` if it exists
4. **Client joins** → Has same events registered (from same `control.lua`)
5. **No mismatch** → Join succeeds!

## Deployment

Both the headless server and viewer client must have identical scenario files:

```bash
# Deploy to both machines
./scripts/deploy-scenario.sh

# After deployment, you MUST:
# 1. Stop headless processes
# 2. Delete/rotate saves (fresh saves required)
# 3. Restart headless processes
```

## Testing

```bash
# Run smoke test
./scripts/smoke-join.sh [slot_number]

# Manual verification:
# 1. Connect viewer client to any running slot
# 2. Should see: "[FLE] Join-proof scenario loaded - version: ..."
# 3. No script-event-mismatch errors
```

## Remote Interface

The scenario exposes a remote interface for command submission:

```lua
-- Enqueue a command from JSON
remote.call("open_world", "enqueue_json", '{"type":"log","payload":{"message":"Hello"}}')

-- Get queue length
remote.call("open_world", "get_queue_length")

-- Get runtime version
remote.call("open_world", "get_version")
```

## Important Notes

### DO NOT

- Register events from RCON-injected Lua code
- Call `script.on_event()` or `script.on_nth_tick()` from tool scripts
- Modify saves from older runtime versions (they won't be joinable)

### DO

- Put all event registrations in `control.lua`
- Use `global.actions.*` functions for tool implementations
- Deploy scenario to both headless and viewer machines
- Rotate saves after updating the scenario

## Version History

| Version | Date | Changes |
|---------|------|---------|
| runtime-2026-02-03-joinproof-v1 | 2026-02-03 | Initial join-proof implementation |

## Troubleshooting

### Client gets script-event-mismatch

1. Verify scenario files are identical on both machines:
   ```bash
   ssh factorio-server 'md5sum /path/to/control.lua'
   ssh factorio-server-mini 'md5sum /path/to/control.lua'
   ```

2. If different, run `scripts/deploy-scenario.sh`

3. If still failing, the save was created with an old runtime. Create a fresh save.

### Events not firing

Check that the FLE tool scripts are properly populating `global.actions.*`:
```lua
/sc rcon.print(global.actions.update_walking_queues and "OK" or "NOT SET")
```

### Version mismatch

Check version on both machines:
```lua
/sc rcon.print(global.runtime_version)
```
