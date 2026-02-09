-- FLE Join-Proof Scenario control.lua
-- This scenario pre-registers ALL events that FLE tools use
-- This prevents multiplayer script-event-mismatch errors when clients join
--
-- DESIGN PRINCIPLES:
-- 1. All event registrations happen here, at scenario load time
-- 2. FLE injects tool scripts via RCON that populate global.actions.* functions
-- 3. The event handlers call global.actions.* functions if they exist
-- 4. Clients joining will have the same events registered (from this control.lua)
--
-- EVENTS REGISTERED:
-- - on_tick: Used by alerts.lua, utils.lua, and command queue draining
-- - on_nth_tick(5): Used by move_to for walking queue updates
-- - on_nth_tick(15): Used by harvest_resource for mining updates
-- - on_script_path_request_finished: Used by request_path for pathfinding
-- - on_player_joined_game: For player join notifications
--
-- WARNING: Do NOT register events from RCON-injected code!
-- All event handlers must be defined here.

local RUNTIME_VERSION = require("version")

util = require("util")

-- =============================================================================
-- GLOBAL INITIALIZATION
-- =============================================================================

-- Initialize all global tables that FLE tools expect
local function init_globals()
    -- Core action dispatch table
    if not global.actions then global.actions = {} end
    if not global.utils then global.utils = {} end

    -- Score tracking
    if not global.initial_score then global.initial_score = {["player"] = 0} end

    -- Alert system
    if not global.alerts then global.alerts = {} end

    -- Tick tracking
    if not global.elapsed_ticks then global.elapsed_ticks = 0 end

    -- Fast mode flag (when true, some features are disabled)
    if not global.fast then global.fast = false end

    -- Agent/player tracking
    if not global.agent_characters then global.agent_characters = {} end

    -- Pathfinding
    if not global.paths then global.paths = {} end
    if not global.path_requests then global.path_requests = {} end
    if not global.clearance_entities then global.clearance_entities = {} end

    -- Resource harvesting
    if not global.harvested_items then global.harvested_items = {} end
    if not global.harvest_queues then global.harvest_queues = {} end

    -- Crafting
    if not global.crafted_items then global.crafted_items = {} end
    if not global.crafting_queue then global.crafting_queue = {} end

    -- Movement
    if not global.walking_queues then global.walking_queues = {} end

    -- Goals
    if not global.goal then global.goal = nil end

    -- Debug settings
    if global.debug == nil then
        global.debug = { rendering = false }
    end

    -- Command queue (for join-proof operation)
    if not global.command_queue then global.command_queue = {} end
    if not global.command_results then global.command_results = {} end
    if not global.command_id_counter then global.command_id_counter = 0 end

    -- Runtime version tracking
    global.runtime_version = RUNTIME_VERSION
end

-- =============================================================================
-- EVENT HANDLERS (Pre-registered stubs that FLE populates via RCON)
-- =============================================================================

-- on_tick handler - used by alerts.lua, utils.lua, and command queue
local function on_tick_handler(event)
    -- Track elapsed ticks (only if not in fast mode)
    if not global.fast and global.elapsed_ticks then
        global.elapsed_ticks = global.elapsed_ticks + 1
    end

    -- Call alerts tick handler if registered (from alerts.lua)
    if global.alerts and global.alerts.on_tick then
        pcall(global.alerts.on_tick, event)
    end

    -- Call utils tick handler if registered (from utils.lua crafting queue)
    if global.utils and global.utils.on_tick then
        pcall(global.utils.on_tick, event)
    end

    -- Process crafting queue (from utils.lua)
    if global.crafting_queue then
        for i = #global.crafting_queue, 1, -1 do
            local task = global.crafting_queue[i]
            if task then
                task.remaining_ticks = (task.remaining_ticks or 0) - 1
                if task.remaining_ticks <= 0 then
                    -- Crafting complete - consume ingredients and give result
                    if task.recipe and task.player and task.entity_name then
                        pcall(function()
                            for _, ingredient in pairs(task.recipe.ingredients) do
                                task.player.remove_item({name = ingredient.name, count = ingredient.amount * (task.count or 1)})
                            end
                            task.player.insert({name = task.entity_name, count = task.count or 1})
                        end)
                    end
                    table.remove(global.crafting_queue, i)
                end
            end
        end
    end

    -- Drain command queue (deterministic processing)
    if global.command_queue and #global.command_queue > 0 then
        local max_per_tick = 20
        local processed = 0
        while processed < max_per_tick and #global.command_queue > 0 do
            local entry = table.remove(global.command_queue, 1)
            if entry and entry.type then
                -- Process command through handlers if available
                if global.command_handlers and global.command_handlers[entry.type] then
                    pcall(global.command_handlers[entry.type], entry.payload)
                end
            end
            processed = processed + 1
        end
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

    -- Also handle the harvest queue processing directly here as a fallback
    if global.harvest_queues then
        for player_index, queue in pairs(global.harvest_queues) do
            local player = global.agent_characters[player_index]
            if not player or not player.valid then goto continue end

            -- Check if we've reached target yield
            if queue.total_yield >= queue.target_yield then
                global.harvest_queues[player_index] = nil
                goto continue
            end

            -- Check distance to mining position
            if queue.mining_position then
                local dist_x = player.position.x - queue.mining_position.x
                local dist_y = player.position.y - queue.mining_position.y
                local sq_dist = (dist_x * dist_x) + (dist_y * dist_y)
                local sq_reach = (player.resource_reach_distance * player.resource_reach_distance)
                if sq_dist > sq_reach then
                    goto continue
                end
            end

            -- Process current mining or get next entity
            if not queue.current_mining then
                local next_entity = table.remove(queue.entities, 1)
                if not next_entity then
                    global.harvest_queues[player_index] = nil
                    goto continue
                end
                queue.current_mining = {
                    entity = next_entity,
                    start_tick = game.tick
                }
            else
                local entity = queue.current_mining.entity
                if not entity or not entity.valid or not entity.minable then
                    queue.current_mining = nil
                    goto continue
                end

                local ticks_mining = game.tick - queue.current_mining.start_tick
                if ticks_mining >= 30 then
                    local inv_before = player.get_main_inventory().get_contents()
                    local mined_ok = player.mine_entity(entity)
                    if mined_ok then
                        local inv_after = player.get_main_inventory().get_contents()
                        local items_added = 0
                        for name, after_count in pairs(inv_after) do
                            local before_count = inv_before[name] or 0
                            items_added = items_added + (after_count - before_count)
                        end
                        if items_added > 0 then
                            local new_total = queue.total_yield + items_added
                            if new_total > queue.target_yield then
                                local overshoot = new_total - queue.target_yield
                                local overshoot_left = overshoot
                                for name, after_count in pairs(inv_after) do
                                    local before_count = inv_before[name] or 0
                                    local gained_this_item = (after_count - before_count)
                                    if gained_this_item > 0 then
                                        local to_remove = math.min(overshoot_left, gained_this_item)
                                        local actually_removed = player.remove_item({name = name, count = to_remove})
                                        overshoot_left = overshoot_left - actually_removed
                                        if overshoot_left <= 0 then break end
                                    end
                                end
                                new_total = queue.target_yield
                            end
                            queue.total_yield = new_total
                        end
                    end
                    queue.current_mining = nil
                end
            end

            ::continue::
        end
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
-- REMOTE INTERFACE FOR COMMAND QUEUE
-- =============================================================================

-- Remote interface for LLM/broker to submit commands
remote.add_interface("open_world", {
    -- Enqueue a command from JSON string
    enqueue_json = function(json_str)
        if not json_str or json_str == "" then
            return nil
        end

        local success, cmd = pcall(function()
            return game.json_to_table(json_str)
        end)

        if not success or not cmd then
            return nil
        end

        global.command_id_counter = global.command_id_counter + 1
        local id = global.command_id_counter

        local entry = {
            id = id,
            tick = game.tick,
            type = cmd.type,
            payload = cmd.payload or {}
        }

        table.insert(global.command_queue, entry)
        return id
    end,

    -- Get queue length
    get_queue_length = function()
        return global.command_queue and #global.command_queue or 0
    end,

    -- Get runtime version
    get_version = function()
        return RUNTIME_VERSION
    end
})

-- =============================================================================
-- EVENT REGISTRATION
-- =============================================================================

script.on_init(function()
    init_globals()
    game.print("[FLE] Join-proof scenario initialized - version: " .. RUNTIME_VERSION)
end)

script.on_load(function()
    -- Globals are already loaded from save
    -- No need to re-initialize
end)

script.on_configuration_changed(function(data)
    init_globals()
    game.print("[FLE] Scenario configuration changed - version: " .. RUNTIME_VERSION)
end)

-- Register the main tick handler
script.on_event(defines.events.on_tick, on_tick_handler)

-- Register nth_tick handlers
script.on_nth_tick(5, on_nth_tick_5_handler)
script.on_nth_tick(15, on_nth_tick_15_handler)

-- Register path request handler
script.on_event(defines.events.on_script_path_request_finished, on_path_request_finished)

-- =============================================================================
-- PLAYER JOIN NOTIFICATION
-- =============================================================================

script.on_event(defines.events.on_player_joined_game, function(event)
    local player = game.get_player(event.player_index)
    if player then
        player.print("[FLE] Join-proof scenario loaded - version: " .. RUNTIME_VERSION)
        player.print("[FLE] Multiplayer sync enabled - all events pre-registered")
    end
end)

-- =============================================================================
-- UTILITY: Remove enemies (called from FLE initialization)
-- =============================================================================

-- This needs to be available globally for FLE's peaceful mode
if not global.remove_enemies then
    global.remove_enemies = function()
        game.forces["enemy"].kill_all_units()
        game.map_settings.enemy_expansion.enabled = false
        game.map_settings.enemy_evolution.enabled = false
        local surface = game.surfaces[1]
        for _, entity in pairs(surface.find_entities_filtered({type="unit-spawner"})) do
            entity.destroy()
        end
    end
end
