"""
Custom FLE MCP server with broker step reporting.

Every execute() call is reported to the broker as a run step, giving full
tracking/observability through the existing dashboard. When RUN_ID is unset,
step reporting is silently skipped (still usable for casual play).
"""

import asyncio
import importlib.util as _ilu
import logging
import os
import sys
import traceback
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from typing import Dict, List

import httpx
from fastmcp import FastMCP
from mcp.server.fastmcp import Image
from mcp.types import ImageContent

# ---------------------------------------------------------------------------
# Logging — stderr only to avoid MCP protocol corruption
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.WARNING, stream=sys.stderr,
    format="%(asctime)s %(name)s %(levelname)s: %(message)s",
)
log = logging.getLogger("fle-mcp")
log.setLevel(logging.INFO)


def _log(msg: str):
    print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Config from env
# ---------------------------------------------------------------------------
SERVER_HOST = os.getenv("FLE_SERVER_HOST", "localhost")
RCON_PORT = int(os.getenv("FLE_RCON_PORT", "27015"))
RCON_PASSWORD = os.getenv("FLE_RCON_PASSWORD", "")
BROKER_URL = os.getenv("BROKER_URL", "http://localhost:8080")
RUN_ID = os.getenv("RUN_ID", "")
RUN_WORKER_API_KEY = os.getenv("RUN_WORKER_API_KEY", "")

# FLE reads the RCON password into a module-level constant during import.
# Export it before importing FactorioInstance so the configured value wins.
if RCON_PASSWORD:
    os.environ["FLE_RCON_PASSWORD"] = RCON_PASSWORD

# ---------------------------------------------------------------------------
# Dynamic import of FactorioMCPRepository (avoids triggering _mcp/__init__
# which would try to create a second FastMCP instance)
# ---------------------------------------------------------------------------
_spec = _ilu.spec_from_file_location(
    "fle.env.protocols._mcp.repository",
    os.path.join(
        os.path.dirname(__import__("fle").__file__),
        "env", "protocols", "_mcp", "repository.py",
    ),
)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
FactorioMCPRepository = _mod.FactorioMCPRepository

import fle.cluster.run_envs as _run_envs  # noqa: E402
import fle.env.instance as _instance_mod  # noqa: E402
from fle.env.instance import FactorioInstance  # noqa: E402
from fle.env.entities import Position  # noqa: E402
from fle.commons.models.game_state import GameState  # noqa: E402

if RCON_PASSWORD:
    _run_envs.RCON_PASSWORD = RCON_PASSWORD
    _instance_mod.RCON_PASSWORD = RCON_PASSWORD

# ---------------------------------------------------------------------------
# Broker step reporting (fire-and-forget, best effort)
# ---------------------------------------------------------------------------
_http = httpx.Client(timeout=10)


def _report_headers() -> dict:
    if RUN_WORKER_API_KEY:
        return {"Authorization": f"Bearer {RUN_WORKER_API_KEY}"}
    return {}


def _report_step(step_idx: int, code: str, **kwargs):
    """Report a step to the broker. No-op when RUN_ID is unset."""
    if not RUN_ID:
        return
    try:
        payload = {"step_idx": step_idx, "code": code, **kwargs}
        for k, v in list(payload.items()):
            if hasattr(v, "item"):  # numpy scalar
                payload[k] = v.item()
        resp = _http.post(
            f"{BROKER_URL}/api/internal/runs/{RUN_ID}/steps",
            json=payload,
            headers=_report_headers(),
        )
        if resp.status_code >= 400:
            _log(f"Warning: step {step_idx} report returned {resp.status_code}: {resp.text[:300]}")
    except Exception as e:
        _log(f"Warning: failed to report step {step_idx}: {e}")


def _fetch_step_idx() -> int:
    """Fetch the current step count from the broker to continue numbering."""
    if not RUN_ID:
        return 0
    try:
        resp = _http.get(f"{BROKER_URL}/api/runs/{RUN_ID}", timeout=5)
        if resp.status_code == 200:
            return resp.json().get("step_count", 0)
    except Exception as e:
        _log(f"Warning: could not fetch step_idx from broker: {e}")
    return 0


# ---------------------------------------------------------------------------
# Shared state
# ---------------------------------------------------------------------------
instance: FactorioInstance | None = None
vcs_repo: FactorioMCPRepository | None = None
step_counter: int = 0
_rcon_patched = False

# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

def _rcon_warmup():
    """Dismiss the 'achievements disabled' warning. Retries 3 times."""
    from factorio_rcon import RCONClient as _WarmupRCON
    import time
    for attempt in range(3):
        try:
            _w = _WarmupRCON(SERVER_HOST, RCON_PORT, RCON_PASSWORD)
            _w.send_command("/sc rcon.print('warmup')")
            _w.send_command("/sc rcon.print('warmup')")
            _w.close()
            _log("RCON warmup OK")
            return
        except Exception as e:
            _log(f"RCON warmup attempt {attempt + 1} failed: {e}")
            time.sleep(2)
    _log("Warning: RCON warmup failed after 3 attempts, continuing anyway")


def _patch_rcon_client():
    """Patch RCONClient to prevent double-connect. Idempotent."""
    global _rcon_patched
    if _rcon_patched:
        return
    from factorio_rcon import RCONClient as _OrigRCON
    _orig_init = _OrigRCON.__init__

    def _patched_init(self, ip_address, port, password, timeout=None, connect_on_init=False):
        _orig_init(self, ip_address, port, password, timeout=timeout, connect_on_init=connect_on_init)

    _OrigRCON.__init__ = _patched_init
    _rcon_patched = True


def _do_connect():
    """Create a fresh FactorioInstance + VCS repo."""
    global instance, vcs_repo
    _log(f"Connecting to Factorio at {SERVER_HOST}:{RCON_PORT}...")
    _rcon_warmup()
    _patch_rcon_client()
    instance = FactorioInstance(
        address=SERVER_HOST,
        tcp_port=RCON_PORT,
        fast=True,
        all_technologies_researched=False,
        clear_entities=False,
    )
    vcs_repo = FactorioMCPRepository(instance)
    _log("Connected OK")


def _do_reconnect():
    """Re-create the FactorioInstance RCON connection in-place."""
    global instance
    # Try to close old connection gracefully
    if instance is not None:
        try:
            instance.reset()
        except Exception:
            pass
        instance = None
    _do_connect()


def _ensure_connected():
    """Ensure we have a live connection — reconnect if needed."""
    global instance
    if instance is None:
        _do_connect()
        return
    # Quick liveness check
    try:
        instance.rcon_client.send_command("/sc rcon.print('ping')")
    except Exception:
        _log("Connection lost, reconnecting...")
        _do_reconnect()


# ---------------------------------------------------------------------------
# MCP server
# ---------------------------------------------------------------------------
mcp = FastMCP("Factorio Learning Environment")


@asynccontextmanager
async def fle_lifespan(server) -> AsyncIterator[None]:
    """Init connection at startup. Non-blocking."""
    global step_counter

    try:
        # Run blocking RCON setup in a thread to avoid blocking the event loop
        await asyncio.to_thread(_do_connect)
        step_counter = _fetch_step_idx()
        _log(f"Step counter starts at {step_counter}")
    except Exception as e:
        # Don't crash the MCP server if initial connection fails —
        # tools will reconnect lazily on first call
        _log(f"Warning: initial connection failed ({e}), will retry on first tool call")
        traceback.print_exc(file=sys.stderr)

    try:
        yield
    finally:
        _log("Shutting down FLE MCP server")
        if instance is not None:
            try:
                instance.reset()
            except Exception:
                pass


mcp._lifespan = fle_lifespan


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
async def execute(code: str) -> str:
    """
    Run Python code against the Factorio game and automatically commit + report.

    All API methods are already imported into the namespace (no imports needed).
    Use `man` resources to discover available methods.

    Args:
        code: Python code to execute
    """
    global step_counter

    try:
        await asyncio.to_thread(_ensure_connected)
    except Exception as e:
        return f"Error: could not connect to Factorio: {e}"

    try:
        result_text, score, response = instance.eval(code, timeout=60)
    except Exception as e:
        # RCON connection likely dropped — try to reconnect once
        _log(f"eval failed ({e}), attempting reconnect...")
        try:
            _do_reconnect()
            result_text, score, response = instance.eval(code, timeout=60)
        except Exception as e2:
            return f"Error: execution failed after reconnect attempt: {e2}"

    # VCS auto-commit
    error_occurred = False
    try:
        gs = GameState.from_instance(instance)
        vcs_repo.commit(gs, f"step {step_counter}: score={score}", policy=code)
    except Exception as e:
        _log(f"VCS commit warning: {e}")

    # Determine error from result
    if result_text and ("Error" in str(result_text) or "error" in str(result_text)):
        error_occurred = True

    # Get production score
    production_score = 0.0
    try:
        production_score = float(score) if score is not None else 0.0
    except (TypeError, ValueError):
        pass

    # Report to broker
    _report_step(
        step_idx=step_counter,
        code=code,
        result=str(response) if response else str(result_text),
        error_occurred=error_occurred,
        reward=0.0,
        production_score=production_score,
        achievements={},
    )
    step_counter += 1

    # Move camera + housekeeping
    try:
        player_pos = instance.namespace.player_location
        instance.rcon_client.send_command(
            f"/c game.players[1].teleport({{x={player_pos.x}, y={player_pos.y}}})"
        )
        instance.rcon_client.send_command('/c game.forces["enemy"].kill_all_units()')
        instance.rcon_client.send_command("/c rendering.clear()")
    except Exception:
        pass

    commit_id = vcs_repo.undo_stack[-1] if vcs_repo and vcs_repo.undo_stack else "unknown"
    short_id = commit_id[:8] if isinstance(commit_id, str) else "unknown"
    return f"[step {step_counter - 1}, commit {short_id}] - stdio:\n{response}"


@mcp.tool()
async def render(center_x: float = 0, center_y: float = 0) -> ImageContent:
    """
    Render the current factory state to a PNG image.

    Args:
        center_x: X coordinate to center on
        center_y: Y coordinate to center on
    """
    try:
        await asyncio.to_thread(_ensure_connected)
        img = instance.namespace._render(position=Position(center_x, center_y))
    except Exception:
        try:
            _do_reconnect()
            img = instance.namespace._render(position=Position(center_x, center_y))
        except Exception as e2:
            raise Exception(f"Render failed after reconnect attempt: {e2}")
    if img is None:
        raise Exception("Failed to render: Game state not initialized or player entity invalid")
    return Image(data=img._repr_png_(), format="png").to_image_content()


@mcp.tool()
async def reconnect() -> str:
    """Re-establish RCON connection to the Factorio server."""
    try:
        await asyncio.to_thread(_do_reconnect)
        commits = len(vcs_repo.undo_stack) if vcs_repo else 0
        return f"Reconnected to Factorio at {SERVER_HOST}:{RCON_PORT}\nCommit history: {commits} commits"
    except Exception as e:
        return f"Reconnect failed: {e}"


@mcp.tool()
async def undo() -> str:
    """Undo the last code execution by restoring the previous game state."""
    global step_counter
    try:
        await asyncio.to_thread(_ensure_connected)
    except Exception as e:
        return f"Error: could not connect: {e}"
    if not vcs_repo:
        return "VCS not initialized."

    try:
        prev_commit_id = vcs_repo.undo()
        if not prev_commit_id:
            return "Nothing to undo. Already at initial state."

        success = vcs_repo.apply_to_instance(prev_commit_id)
        if success:
            _report_step(step_idx=step_counter, code="# VCS: UNDO",
                         result=f"Undone to commit {prev_commit_id[:8]}",
                         error_occurred=False, reward=0.0, production_score=0.0, achievements={})
            step_counter += 1
            return f"Undid last operation. Restored to commit {prev_commit_id[:8]}"
        return "Failed to restore previous state"
    except Exception as e:
        return f"Error during undo: {e}"


@mcp.tool()
async def commit(tag_name: str, message: str = "") -> str:
    """
    Tag the current game state as a named checkpoint.

    Args:
        tag_name: Name for this checkpoint
        message: Optional description
    """
    try:
        await asyncio.to_thread(_ensure_connected)
    except Exception as e:
        return f"Error: could not connect: {e}"
    if not vcs_repo:
        return "VCS not initialized."

    try:
        commit_id = vcs_repo.tag_commit(tag_name)
        if message:
            gs = GameState.from_instance(instance)
            policy = vcs_repo.get_policy(commit_id)
            commit_id = vcs_repo.commit(gs, message, policy)
            vcs_repo.tag_commit(tag_name, commit_id)
        return f"Tagged current state as '{tag_name}' (commit {commit_id[:8]})"
    except Exception as e:
        return f"Error tagging checkpoint: {e}"


@mcp.tool()
async def restore(ref: str) -> str:
    """
    Restore to a previously tagged state or commit ID.

    Args:
        ref: Tag name or commit ID (can be abbreviated)
    """
    global step_counter
    try:
        await asyncio.to_thread(_ensure_connected)
    except Exception as e:
        return f"Error: could not connect: {e}"
    if not vcs_repo:
        return "VCS not initialized."

    try:
        tag_commit = vcs_repo.get_tag(ref)
        if tag_commit:
            commit_id = tag_commit
        else:
            if len(ref) < 40:
                history = vcs_repo.get_history(max_count=100)
                for c in history:
                    if c["id"].startswith(ref):
                        commit_id = c["id"]
                        break
                else:
                    return f"No commit found matching '{ref}'"
            else:
                commit_id = ref

        success = vcs_repo.apply_to_instance(commit_id)
        if success:
            vcs_repo.checkout(commit_id)
            _report_step(step_idx=step_counter, code=f"# VCS: RESTORE {ref}",
                         result=f"Restored to {ref} (commit {commit_id[:8]})",
                         error_occurred=False, reward=0.0, production_score=0.0, achievements={})
            step_counter += 1
            return f"Restored to {ref} (commit {commit_id[:8]})"
        return f"Failed to restore: no state data in commit {commit_id[:8]}"
    except Exception as e:
        return f"Error restoring checkpoint: {e}"


@mcp.tool()
async def view_history(limit: int = 10) -> str:
    """
    View commit history of game states.

    Args:
        limit: Maximum number of commits to show
    """
    try:
        await asyncio.to_thread(_ensure_connected)
    except Exception as e:
        return f"Error: could not connect: {e}"
    if not vcs_repo:
        return "VCS not initialized."

    try:
        history = vcs_repo.get_history(max_count=limit)
        tags = vcs_repo.list_tags()
        commit_to_tags = {}
        for tag_name, cid in tags.items():
            commit_to_tags.setdefault(cid, []).append(tag_name)

        if not history:
            return "No commit history found."

        result = "Checkpoint History:\n"
        for i, c in enumerate(history):
            cid = c["id"]
            tag_str = f" [{', '.join(commit_to_tags[cid])}]" if cid in commit_to_tags else ""
            has_policy = "Y" if c["has_policy"] else " "
            result += f"{i + 1}. [{cid[:8]}]{tag_str} {has_policy} {c['message']}\n"
        return result
    except Exception as e:
        return f"Error reading history: {e}"


@mcp.tool()
async def view_code(ref: str) -> str:
    """
    View the code associated with a commit or tag.

    Args:
        ref: Tag name or commit ID
    """
    try:
        await asyncio.to_thread(_ensure_connected)
    except Exception as e:
        return f"Error: could not connect: {e}"
    if not vcs_repo:
        return "VCS not initialized."

    try:
        if ref in vcs_repo.list_tags():
            commit_id = vcs_repo.get_tag(ref)
        else:
            if len(ref) < 40:
                history = vcs_repo.get_history(max_count=100)
                for c in history:
                    if c["id"].startswith(ref):
                        commit_id = c["id"]
                        break
                else:
                    return f"No commit found matching '{ref}'"
            else:
                commit_id = ref

        policy = vcs_repo.get_policy(commit_id)
        if not policy:
            return f"No code found for {ref} (commit {commit_id[:8]})"
        return f"Code for {ref} (commit {commit_id[:8]}):\n\n```python\n{policy}\n```"
    except Exception as e:
        return f"Error reading code: {e}"


# ---------------------------------------------------------------------------
# Resources (read-only, no broker reporting)
# All resources return error values instead of raising — raising kills the
# MCP process.
# ---------------------------------------------------------------------------

@mcp.resource("fle://inventory")
async def res_inventory() -> Dict:
    """Get your current inventory."""
    try:
        _ensure_connected()
        return instance.namespace.inspect_inventory()
    except Exception as e:
        return {"error": str(e)}


@mcp.resource("fle://position")
async def res_position() -> Dict[str, float]:
    """Get your current position in the Factorio world."""
    try:
        _ensure_connected()
        pos = instance.namespace.player_location
        return {"x": pos.x, "y": pos.y}
    except Exception as e:
        return {"error": str(e)}


@mcp.resource("fle://entities/{cx}/{cy}/{radius}")
async def res_entities(cx: str, cy: str, radius: str) -> List[Dict]:
    """Get all entities near a position."""
    try:
        _ensure_connected()
        x = float(cx) if cx != "default" else 0
        y = float(cy) if cy != "default" else 0
        r = float(radius) if radius != "default" else 500
        entities = instance.namespace.get_entities(position=Position(x, y), radius=r)
        return [e.model_dump() for e in entities]
    except Exception as e:
        return [{"error": str(e)}]


@mcp.resource("fle://metrics")
async def res_metrics() -> Dict:
    """Production throughput statistics."""
    try:
        _ensure_connected()
        stats = instance.namespace.get_production_stats()
        return stats
    except Exception as e:
        return {"error": str(e)}


@mcp.resource("fle://warnings")
async def res_warnings() -> list:
    """Get active game warnings."""
    try:
        _ensure_connected()
        return instance.get_warnings()
    except Exception as e:
        return [f"error: {e}"]


@mcp.resource("fle://status")
async def res_status() -> str:
    """Check connection status and step counter."""
    connected = instance is not None
    commits = len(vcs_repo.undo_stack) if vcs_repo and hasattr(vcs_repo, 'undo_stack') else 0
    reporting = f"reporting to run {RUN_ID}" if RUN_ID else "no broker reporting"
    status = "connected" if connected else "disconnected"
    return (
        f"Status: {status} ({SERVER_HOST}:{RCON_PORT})\n"
        f"Step counter: {step_counter}, Commits: {commits}\n"
        f"Broker: {reporting}"
    )


@mcp.resource("fle://api/schema")
async def res_schema() -> str:
    """Get the full API object model for writing Factorio code."""
    try:
        import importlib.resources
        from fle.env.utils.controller_loader.system_prompt_generator import SystemPromptGenerator
        execution_path = importlib.resources.files("fle") / "env"
        generator = SystemPromptGenerator(str(execution_path))
        return f"\n\n{generator.types()}\n\n{generator.entities()}"
    except Exception as e:
        return f"Error loading schema: {e}"


@mcp.resource("fle://api/manual", mime_type="application/json")
async def res_manuals() -> dict:
    """List available API tool manuals."""
    try:
        import importlib.resources
        execution_path = importlib.resources.files("fle") / "env"
        agent_tools_path = execution_path / "tools" / "agent"
        if not agent_tools_path.exists() or not agent_tools_path.is_dir():
            return {"error": "Agent tools directory not found"}
        return {"tools": [d.name for d in agent_tools_path.iterdir() if d.is_dir()]}
    except Exception as e:
        return {"error": str(e)}


@mcp.resource("fle://api/manual/{method}")
async def res_manual(method: str) -> str:
    """Get API documentation for a specific method."""
    try:
        import importlib.resources
        from fle.env.utils.controller_loader.system_prompt_generator import SystemPromptGenerator
        execution_path = importlib.resources.files("fle") / "env"
        generator = SystemPromptGenerator(str(execution_path))
        return generator.manual(method)
    except Exception as e:
        return f"Error loading manual: {e}"


@mcp.resource("fle://prototypes")
async def res_prototypes() -> List[str]:
    """Get the names of all entity prototypes available in the game."""
    try:
        from fle.env.protocols._mcp.state import FactorioMCPState
        recipes = FactorioMCPState.load_recipes_from_file(None)
        return [r.name for r in recipes.values()]
    except Exception as e:
        return [f"error: {e}"]


@mcp.resource("fle://recipe/{prototype}")
async def res_recipe(prototype: str) -> str:
    """Get recipe details for a specific prototype."""
    try:
        import json as _json
        from fle.env.protocols._mcp.state import FactorioMCPState
        recipes = FactorioMCPState.load_recipes_from_file(None)
        if prototype not in recipes:
            return f"Recipe '{prototype}' not found."
        r = recipes[prototype]
        return _json.dumps({"name": r.name, "ingredients": r.ingredients,
                            "results": r.results, "energy_required": r.energy_required}, indent=2)
    except Exception as e:
        return f"Error loading recipe: {e}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    mcp.run()
