import importlib.util as _ilu
import os
import time

from factorio_rcon import RCONClient as _WarmupRCON
from factorio_rcon import RCONClient as _OrigRCON
from fle.cluster.run_envs import RCON_PASSWORD as _rcon_pw
from fle.env.instance import FactorioInstance
from fle.env.gym_env.environment import FactorioGymEnv
from fle.env.gym_env.observation_formatter import BasicObservationFormatter
from fle.env import Layer, Position

# Import FactorioMCPRepository directly to avoid triggering _mcp/__init__.py
# which requires fastmcp (MCP server dep).
_spec = _ilu.spec_from_file_location(
    "fle.env.protocols._mcp.repository",
    os.path.join(os.path.dirname(__import__("fle").__file__), "env", "protocols", "_mcp", "repository.py"),
)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
FactorioMCPRepository = _mod.FactorioMCPRepository


def render_map(instance, radius=20):
    """Render map around player, return base64 PNG or None."""
    try:
        ns = instance.namespaces[0]
        player_pos = Position(0, 0)
        if hasattr(ns, "PLAYER") and hasattr(ns.PLAYER, "position"):
            player_pos = ns.PLAYER.position
        elif hasattr(ns, "player_location"):
            player_pos = ns.player_location
        img = ns._render(position=player_pos, layers=Layer.ALL)
        return img.to_base64()
    except Exception as e:
        print(f"Warning: map render failed: {e}")
        return None


def warmup_rcon(host: str, port: int, password: str):
    """Send two warmup commands to dismiss the 'achievements will be disabled' warning."""
    for attempt in range(3):
        try:
            client = _WarmupRCON(host, port, password)
            client.send_command("/sc rcon.print('warmup')")
            client.send_command("/sc rcon.print('warmup')")
            client.close()
            print("RCON warmup OK (achievements warning dismissed)")
            return
        except Exception as e:
            print(f"RCON warmup attempt {attempt + 1} failed: {e}")
            time.sleep(2)


def patch_rcon_client():
    """Fix FLE double-connect issue: default connect_on_init to False."""
    _orig_init = _OrigRCON.__init__

    def _patched_init(self, ip_address, port, password, timeout=None, connect_on_init=False):
        _orig_init(self, ip_address, port, password, timeout=timeout, connect_on_init=connect_on_init)

    _OrigRCON.__init__ = _patched_init


def connect_factorio(host: str, port: int) -> FactorioInstance:
    """Warmup RCON, patch client, connect FLE, and initialize game state."""
    warmup_rcon(host, port, _rcon_pw)
    patch_rcon_client()

    print(f"Connecting to Factorio at {host}:{port}...")
    instance = FactorioInstance(
        address=host,
        tcp_port=port,
        fast=True,
        all_technologies_researched=False,
        clear_entities=False,
    )

    # Set non-agent players (stream client) to spectator mode
    instance.rcon_client.send_command(
        "/sc for _, p in pairs(game.players) do "
        "if not global.agent_characters then break end; "
        "local is_agent = false; "
        "for _, c in pairs(global.agent_characters) do "
        "if c.valid and c.associated_player == p then is_agent = true; break end "
        "end; "
        "if not is_agent then p.set_controller({type = defines.controllers.spectator}) end "
        "end"
    )

    # Remove enemies
    instance.rcon_client.send_command(
        "/sc game.forces['enemy'].kill_all_units(); "
        "game.map_settings.enemy_expansion.enabled = false; "
        "game.map_settings.enemy_evolution.enabled = false; "
        "for _, e in pairs(game.surfaces[1].find_entities_filtered({type='unit-spawner'})) do e.destroy() end"
    )

    return instance


def setup_gym_env(instance: FactorioInstance):
    """Wrap instance in VCS repo + FactorioGymEnv + obs formatter.

    Returns:
        (vcs_repo, gym_env, obs_formatter)
    """
    vcs_repo = FactorioMCPRepository(instance)

    gym_env = FactorioGymEnv(
        instance=instance,
        task=None,
        error_penalty=0.0,
        pause_after_action=False,
    )

    obs_formatter = BasicObservationFormatter(
        include_inventory=True,
        include_entities=True,
        include_flows=True,
        include_task=False,
        include_messages=False,
        include_functions=False,
        include_research=True,
        include_game_info=True,
        include_raw_output=True,
    )

    return vcs_repo, gym_env, obs_formatter
