from mcp.server.fastmcp import Image
from mcp.types import ImageContent

from fle.env.entities import Position
from fle.commons.models.game_state import GameState

from fle.env.protocols._mcp.init import state, initialize_session
from fle.env.protocols._mcp import mcp

import json
import os
import urllib.request
from datetime import datetime, timezone


def _post_activity(events: list[dict]):
    """Fire-and-forget POST activity events to the broker."""
    broker_url = os.environ.get("CLAUDETORIO_BROKER_URL")
    session_id = os.environ.get("CLAUDETORIO_SESSION_ID")
    if not broker_url or not session_id:
        return
    try:
        payload = json.dumps({"events": events}).encode("utf-8")
        req = urllib.request.Request(
            f"{broker_url}/api/session/{session_id}/events",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=2)
    except Exception:
        pass


def _ts():
    return datetime.now(timezone.utc).isoformat()


#
@mcp.tool()
async def render(center_x: float = 0, center_y: float = 0) -> ImageContent:
    """
    Render the current factory state to an image

    Args:
        center_x: X coordinate to center on (defaults to factory center)
        center_y: Y coordinate to center on (defaults to factory center)
    """
    if not state.active_server:
        raise Exception("No active Factorio server connection. Use status first.")

    instance = state.active_server

    _post_activity([{"type": "tool_use", "timestamp": _ts(), "summary": f"render({center_x}, {center_y})"}])

    try:
        img = instance.namespace._render(position=Position(center_x, center_y))
        if img is None:
            raise Exception(
                "Failed to render: Game state not properly initialized or player entity invalid"
            )
        _post_activity([{"type": "output", "timestamp": _ts(), "summary": "Render complete"}])
        return Image(data=img._repr_png_(), format="png").to_image_content()
    except Exception as e:
        _post_activity([{"type": "error", "timestamp": _ts(), "summary": f"Render error: {str(e)[:120]}"}])
        raise Exception(f"Error rendering: {str(e)}")


@mcp.tool()
async def execute(code: str) -> str:
    """
    Run Python code and automatically commit the result.

    All API methods are already imported into the namespace, so no need to import any Factorio methods or types (e.g Direction, Prototype etc)

    If you are confused about what methods are available, use `ls` followed by `man` to read the manual about a method.

    If you need to debug an error message, use the introspection tools (e.g `cat`) to analyse the *.lua and *.py implementations.

    Args:
        code: Python code to execute
    """
    if not state.active_server:
        await initialize_session(
            None
        )  # "No active Factorio server connection. Use connect first."

    vcs = state.get_vcs()
    if not vcs:
        return "VCS not initialized. Please connect to a server first."

    instance = state.active_server

    # Report code execution to dashboard
    code_preview = code.strip().split('\n')[0][:100]
    _post_activity([{"type": "code_exec", "timestamp": _ts(), "summary": code_preview, "detail": code[:500]}])

    # Execute the code
    result, score, response = instance.eval(code, timeout=60)

    # Report result
    response_preview = str(response).strip()[:150] if response else "OK"
    if result:
        _post_activity([{"type": "output", "timestamp": _ts(), "summary": response_preview}])
    else:
        _post_activity([{"type": "error", "timestamp": _ts(), "summary": response_preview}])

    # Automatically commit the successful state
    current_state = GameState.from_instance(instance)
    commit_id = vcs.commit(current_state, "Auto-commit after code execution", code)

    _post_activity([{"type": "commit", "timestamp": _ts(), "summary": f"[{commit_id[:8]}]"}])

    # Update game state file after execution
    try:
        game_state_data = {
            "inventory": instance.namespace.inspect_inventory(),
            "entities": instance.namespace.get_entities(radius=100),
            "score": instance.namespace.score(),
            "game_tick": instance.namespace.game_info.tick,
            "position": instance.namespace.player_location,
            "production_stats": instance.namespace.get_production_stats(),
        }

        from pathlib import Path

        state_file = Path("/tmp/factorio_game_state.json")
        with open(state_file, "w") as f:
            json.dump(game_state_data, f, default=str)

        # Fire-and-forget POST to broker for live dashboard
        broker_url = os.environ.get("CLAUDETORIO_BROKER_URL")
        session_id = os.environ.get("CLAUDETORIO_SESSION_ID")
        if broker_url and session_id:
            try:
                raw_score = game_state_data.get("score", 0)
                score_val = raw_score.get("player", 0) if isinstance(raw_score, dict) else (raw_score if isinstance(raw_score, (int, float)) else 0)
                payload = json.dumps({
                    "score": score_val,
                    "game_tick": game_state_data.get("game_tick", 0),
                    "inventory_summary": game_state_data.get("inventory"),
                    "production_summary": game_state_data.get("production_stats"),
                    "entity_count": len(game_state_data.get("entities", [])) if isinstance(game_state_data.get("entities"), list) else 0,
                }, default=str).encode("utf-8")
                req = urllib.request.Request(
                    f"{broker_url}/api/session/{session_id}/game-state",
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=2)
            except Exception:
                pass  # RCON polling is the fallback
    except Exception:
        # Don't fail the whole execution just because state file update failed
        pass

    '/c local surface = game.player.surface; for key, entity in pairs(surface.find_entities_filtered({force="enemy"})) do; entity.destroy(); end'

    try:
        player_pos = instance.namespace.player_location
        # RCON command to move camera to player position
        rcon_cmd = f"/c game.players[1].teleport({{x={player_pos.x}, y={player_pos.y}}})"  # ; game.player.zoom_to_world(game.player.position, 1)'
        meta = instance.rcon_client.send_command(rcon_cmd)

        kill_biters_cmd = '/c game.forces["enemy"].kill_all_units()'
        instance.rcon_client.send_command(kill_biters_cmd)

        clear_rendering = "/c rendering.clear()"
        instance.rcon_client.send_command(clear_rendering)

    except Exception as e:
        # Don't fail execution if viewport move fails
        meta = str(e)

    return f"[commit {commit_id[:8]}] - stdio:\n{response}\n{meta}"


@mcp.tool()
async def reconnect() -> str:
    """
    Reconnect with the Factorio server
    """
    _post_activity([{"type": "tool_use", "timestamp": _ts(), "summary": "reconnect()"}])

    if not state.active_server:
        result = await initialize_session(None)
        _post_activity([{"type": "system", "timestamp": _ts(), "summary": "Session initialized"}])
        return result

    server_id = state.active_server.tcp_port
    if server_id in state.available_servers:
        server = state.available_servers[server_id]
        vcs = state.get_vcs()
        commits = len(vcs.undo_stack) if vcs else 0

        _post_activity([{"type": "system", "timestamp": _ts(), "summary": f"Connected to {server.name}, {commits} commits"}])
        return (
            f"Connected to Factorio server: {server.name} ({server.address}:{server.tcp_port})\n"
            f"Commit history: {commits} commits"
        )
    else:
        return "Connected to Factorio server"
