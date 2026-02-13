-- commands.lua: Deterministic command queue for join-proof scenario
-- All LLM/RCON commands should be enqueued here rather than executed directly

local commands = {}

-- Maximum commands to process per tick to avoid lag spikes
local MAX_COMMANDS_PER_TICK = 20

-- Initialize the command queue
function commands.init()
    if not global.command_queue then
        global.command_queue = {}
    end
    if not global.command_results then
        global.command_results = {}
    end
    if not global.command_id_counter then
        global.command_id_counter = 0
    end
end

-- Enqueue a command for deterministic processing
-- cmd should be a table: {type = "command_type", payload = {...}}
function commands.enqueue(cmd)
    if not cmd or type(cmd) ~= "table" then
        return nil, "Invalid command format"
    end

    if not cmd.type then
        return nil, "Command must have a type"
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
end

-- Parse JSON string and enqueue
function commands.enqueue_json(json_str)
    if not json_str or json_str == "" then
        return nil, "Empty JSON string"
    end

    -- Use game.json_to_table for parsing
    local success, cmd = pcall(function()
        return game.json_to_table(json_str)
    end)

    if not success or not cmd then
        return nil, "Invalid JSON: " .. tostring(cmd)
    end

    return commands.enqueue(cmd)
end

-- Command handlers table - add handlers for specific command types
commands.handlers = {}

-- Example handler for a "log" command
commands.handlers["log"] = function(payload)
    if payload.message then
        game.print("[CMD] " .. tostring(payload.message))
    end
    return {success = true}
end

-- Handler for setting global state (safe way to modify globals)
commands.handlers["set_global"] = function(payload)
    if payload.key and payload.value ~= nil then
        global[payload.key] = payload.value
        return {success = true, key = payload.key}
    end
    return {success = false, error = "Missing key or value"}
end

-- Process a single command
local function process_command(entry)
    local handler = commands.handlers[entry.type]

    if handler then
        local success, result = pcall(handler, entry.payload)
        if success then
            global.command_results[entry.id] = {
                id = entry.id,
                tick = game.tick,
                success = true,
                result = result
            }
        else
            global.command_results[entry.id] = {
                id = entry.id,
                tick = game.tick,
                success = false,
                error = tostring(result)
            }
        end
    else
        global.command_results[entry.id] = {
            id = entry.id,
            tick = game.tick,
            success = false,
            error = "Unknown command type: " .. tostring(entry.type)
        }
    end
end

-- Drain the command queue (called from on_tick)
function commands.drain(max_per_tick)
    max_per_tick = max_per_tick or MAX_COMMANDS_PER_TICK

    if not global.command_queue or #global.command_queue == 0 then
        return 0
    end

    local processed = 0
    while processed < max_per_tick and #global.command_queue > 0 do
        local entry = table.remove(global.command_queue, 1)
        process_command(entry)
        processed = processed + 1
    end

    return processed
end

-- Get result of a command by ID
function commands.get_result(id)
    return global.command_results[id]
end

-- Clear old results (call periodically to prevent memory growth)
function commands.clear_old_results(max_age_ticks)
    max_age_ticks = max_age_ticks or 3600  -- Default: 1 minute
    local current_tick = game.tick

    for id, result in pairs(global.command_results) do
        if current_tick - result.tick > max_age_ticks then
            global.command_results[id] = nil
        end
    end
end

-- Get queue length
function commands.queue_length()
    return global.command_queue and #global.command_queue or 0
end

return commands
