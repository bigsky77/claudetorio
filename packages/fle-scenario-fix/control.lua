-- FLE Unified Scenario control.lua
-- This scenario pre-registers ALL events that FLE tools use
-- This prevents multiplayer script-event-mismatch errors when clients join
--
-- How it works:
-- 1. This control.lua registers ALL events at scenario load time
-- 2. FLE injects tool scripts via RCON that populate global.actions.* functions
-- 3. The event handlers call global.actions.* functions if they exist
-- 4. Clients joining will have the same events registered (from this control.lua)
--
-- Events registered:
-- - on_tick: Used by alerts.lua and utils.lua
-- - on_nth_tick(5): Used by move_to for walking queue updates
-- - on_nth_tick(15): Used by harvest_resource for mining updates
-- - on_script_path_request_finished: Used by request_path for pathfinding

util = require("util")

-- =============================================================================
-- GLOBAL INITIALIZATION
-- =============================================================================

-- Initialize all global tables that FLE tools expect
local function init_globals()
    if not global.actions then global.actions = {} end
    if not global.utils then global.utils = {} end
    if not global.initial_score then global.initial_score = {["player"] = 0} end
    if not global.alerts then global.alerts = {} end
    if not global.elapsed_ticks then global.elapsed_ticks = 0 end
    if not global.fast then global.fast = false end
    if not global.agent_characters then global.agent_characters = {} end
    if not global.paths then global.paths = {} end
    if not global.path_requests then global.path_requests = {} end
    if not global.harvested_items then global.harvested_items = {} end
    if not global.crafted_items then global.crafted_items = {} end
    if not global.walking_queues then global.walking_queues = {} end
    if not global.harvest_queues then global.harvest_queues = {} end
    if not global.goal then global.goal = nil end
    if not global.clearance_entities then global.clearance_entities = {} end
    if global.debug == nil then
        global.debug = { rendering = false }
    end
end

-- =============================================================================
-- EVENT HANDLERS (Pre-registered stubs that FLE populates via RCON)
-- =============================================================================

-- on_tick handler - used by alerts.lua and utils.lua
local function on_tick_handler(event)
    -- Track elapsed ticks (only if not in fast mode)
    if not global.fast and global.elapsed_ticks then
        global.elapsed_ticks = global.elapsed_ticks + 1
    end

    -- Call alerts tick handler if registered
    if global.alerts and global.alerts.on_tick then
        pcall(global.alerts.on_tick, event)
    end

    -- Call utils tick handler if registered
    if global.utils and global.utils.on_tick then
        pcall(global.utils.on_tick, event)
    end
end

-- on_nth_tick(5) handler - used by move_to for walking queues
local function on_nth_tick_5_handler(event)
    -- Only process walking queues if not in fast mode
    if global.fast then return end

    if global.walking_queues and global.actions and global.actions.update_walking_queues then
        pcall(global.actions.update_walking_queues)
    end
end

-- on_nth_tick(15) handler - used by harvest_resource
local function on_nth_tick_15_handler(event)
    -- Only process harvesting if not in fast mode
    if global.fast then return end

    if global.harvest_queues and global.actions and global.actions.update_harvesting then
        pcall(global.actions.update_harvesting, event)
    end
end

-- on_script_path_request_finished handler - used by request_path
local function on_path_request_finished(event)
    if not global.path_requests then return end

    local request_data = global.path_requests[event.id]
    if not request_data then return end

    if event.path then
        global.paths[event.id] = event.path
    elseif event.try_again_later then
        global.paths[event.id] = "busy"
    else
        global.paths[event.id] = "not_found"
    end

    -- Clean up clearance entities if any
    if global.clearance_entities and global.clearance_entities[event.id] then
        for _, entity in pairs(global.clearance_entities[event.id]) do
            if entity.valid then
                entity.destroy()
            end
        end
        global.clearance_entities[event.id] = nil
    end
end

-- =============================================================================
-- EVENT REGISTRATION
-- =============================================================================

script.on_init(function()
    init_globals()
end)

script.on_load(function()
    -- Globals are already loaded from save
    -- No need to re-initialize, but ensure tables exist for safety
end)

script.on_configuration_changed(function(data)
    init_globals()
end)

-- Register the main tick handler
script.on_event(defines.events.on_tick, on_tick_handler)

-- Register nth_tick handlers
script.on_nth_tick(5, on_nth_tick_5_handler)
script.on_nth_tick(15, on_nth_tick_15_handler)

-- Register path request handler
script.on_event(defines.events.on_script_path_request_finished, on_path_request_finished)

-- =============================================================================
-- DEBUG: Print event registration status
-- =============================================================================

script.on_event(defines.events.on_player_joined_game, function(event)
    local player = game.get_player(event.player_index)
    if player then
        player.print("[FLE] Unified scenario loaded - multiplayer sync enabled")
    end
end)
