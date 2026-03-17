import argparse
import json
import os
import sys
import traceback

import httpx
from dotenv import load_dotenv

# Load .env BEFORE any FLE imports — FLE captures env vars at module-level import time.
load_dotenv()

# All logging goes to stderr so stdout stays JSON-only.
import logging
logging.basicConfig(level=logging.WARNING, stream=sys.stderr,
                    format="%(asctime)s %(name)s %(levelname)s: %(message)s")

from fle.env.gym_env.environment import FactorioGymEnv  # noqa: E402
from fle.env.gym_env.observation import Observation  # noqa: E402
from fle.env.gym_env.observation_formatter import BasicObservationFormatter  # noqa: E402
from fle.env.gym_env.action import Action  # noqa: E402
from fle.commons.models.game_state import GameState  # noqa: E402

# Import FactorioMCPRepository directly — same dynamic import as main.py to avoid
# triggering _mcp/__init__.py which requires fastmcp.
import importlib.util as _ilu
_spec = _ilu.spec_from_file_location(
    "fle.env.protocols._mcp.repository",
    os.path.join(os.path.dirname(__import__("fle").__file__), "env", "protocols", "_mcp", "repository.py"),
)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
FactorioMCPRepository = _mod.FactorioMCPRepository


# ---------------------------------------------------------------------------
# Reporting helpers (copied verbatim from main.py)
# ---------------------------------------------------------------------------

def _report_headers() -> dict:
    key = os.getenv("RUN_WORKER_API_KEY", "")
    if key:
        return {"Authorization": f"Bearer {key}"}
    return {}


def report_step(broker_url: str, run_id: str, step_idx: int, code: str, **kwargs):
    """Report a step to the broker (fire-and-forget, best effort)."""
    try:
        payload = {"step_idx": step_idx, "code": code, **kwargs}
        for k, v in payload.items():
            if hasattr(v, 'item'):  # numpy scalar
                payload[k] = v.item()
        resp = httpx.post(
            f"{broker_url}/api/internal/runs/{run_id}/steps",
            json=payload,
            headers=_report_headers(),
            timeout=10,
        )
        if resp.status_code >= 400:
            print(f"Warning: step {step_idx} report returned {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
    except Exception as e:
        print(f"Warning: failed to report step {step_idx}: {e}", file=sys.stderr)


def parse_vcs_directives(code):
    """Extract # VCS: directives from code. Returns (directives, remaining_code)."""
    directives = []
    remaining = []
    for line in code.strip().split('\n'):
        stripped = line.strip()
        if stripped.startswith('# VCS:'):
            directives.append(stripped[6:])
        else:
            remaining.append(line)
    return directives, '\n'.join(remaining)


def emit_json(data: dict):
    """Write sanitised JSON to stdout and flush."""
    def _default(obj):
        if hasattr(obj, 'item'):  # numpy scalar
            return obj.item()
        return str(obj)
    sys.stdout.write(json.dumps(data, default=_default))
    sys.stdout.write('\n')
    sys.stdout.flush()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _fetch_step_idx(broker_url: str, run_id: str) -> int:
    """Fetch the current step count from the broker to use as next step_idx."""
    try:
        resp = httpx.get(f"{broker_url}/api/runs/{run_id}", timeout=5)
        if resp.status_code == 200:
            return resp.json().get("step_count", 0)
    except Exception as e:
        print(f"Warning: could not fetch step_idx from broker: {e}", file=sys.stderr)
    return 0


def main():
    parser = argparse.ArgumentParser(
        description="Single-shot Factorio REPL: reads Python from stdin, executes one step, emits JSON to stdout"
    )
    parser.add_argument("run_id", nargs="?", default=os.getenv("RUN_ID"),
                        help="Run ID for broker reporting (falls back to RUN_ID env)")
    parser.add_argument("--broker-url", type=str,
                        default=os.getenv("BROKER_URL", "http://localhost:8080"),
                        help="Broker API URL")
    parser.add_argument("--server-host", type=str,
                        default=os.getenv("SERVER_HOST", "localhost"),
                        help="Factorio server hostname/IP")
    parser.add_argument("--rcon-port", type=int,
                        default=int(os.getenv("RCON_PORT", "27015")),
                        help="Factorio RCON port")
    args = parser.parse_args()

    run_id: str | None = args.run_id
    broker_url: str = args.broker_url
    server_host: str = args.server_host
    rcon_port: int = args.rcon_port

    # Fetch step_idx from broker
    step_idx = _fetch_step_idx(broker_url, run_id) if run_id else 0

    print(f"Step idx: {step_idx}", file=sys.stderr)

    # FLE reads this env var at module import time; we set it here too just in case
    # it's used by later lazy imports.
    os.environ["FLE_RCON_PORT"] = str(rcon_port)

    gym_env = None
    try:
        # ── RCON warmup (3-attempt loop) ────────────────────────────────
        from factorio_rcon import RCONClient as _WarmupRCON
        from fle.cluster.run_envs import RCON_PASSWORD as _rcon_pw
        for attempt in range(3):
            try:
                _warmup = _WarmupRCON(server_host, rcon_port, _rcon_pw)
                _warmup.send_command("/sc rcon.print('warmup')")
                _warmup.send_command("/sc rcon.print('warmup')")
                _warmup.close()
                print("RCON warmup OK", file=sys.stderr)
                break
            except Exception as e:
                print(f"RCON warmup attempt {attempt+1} failed: {e}", file=sys.stderr)
                import time; time.sleep(2)

        # ── Patch RCONClient to prevent double-connect ───────────────────
        from factorio_rcon import RCONClient as _OrigRCON
        _orig_init = _OrigRCON.__init__
        def _patched_init(self, ip_address, port, password, timeout=None, connect_on_init=False):
            _orig_init(self, ip_address, port, password, timeout=timeout, connect_on_init=connect_on_init)
        _OrigRCON.__init__ = _patched_init

        # ── FactorioInstance ─────────────────────────────────────────────
        from fle.env.instance import FactorioInstance
        print(f"Connecting to Factorio at {server_host}:{rcon_port}...", file=sys.stderr)
        instance = FactorioInstance(
            address=server_host,
            tcp_port=rcon_port,
            fast=True,
            all_technologies_researched=False,
            clear_entities=False,
        )

        # ── VCS + gym env + observation formatter ────────────────────────
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

        # ── Pre-step observation ─────────────────────────────────────────
        pre_obs = gym_env.get_observation(agent_idx=0)
        obs_text = obs_formatter.format(pre_obs).raw_str

        # ── Read stdin ───────────────────────────────────────────────────
        code = sys.stdin.read().strip()
        if not code:
            emit_json({
                "step_idx": step_idx,
                "observation": obs_text,
                "observation_after": None,
                "result": None,
                "error_occurred": True,
                "reward": 0.0,
                "production_score": 0.0,
                "achievements": [],
                "vcs": "error: empty stdin",
            })
            sys.exit(1)

        # ── VCS directives ───────────────────────────────────────────────
        directives, remaining_code = parse_vcs_directives(code)
        vcs_results = []
        for directive in directives:
            try:
                if directive == "UNDO":
                    prev_id = vcs_repo.undo()
                    if prev_id:
                        vcs_repo.apply_to_instance(prev_id)
                        vcs_results.append(f"Undone to commit {prev_id[:8]}")
                    else:
                        vcs_results.append("Nothing to undo")
                elif directive.startswith("TAG:"):
                    name = directive[4:]
                    vcs_repo.tag_commit(name)
                    vcs_results.append(f"Tagged as '{name}'")
                elif directive.startswith("RESTORE:"):
                    ref = directive[8:]
                    tag_id = vcs_repo.get_tag(ref)
                    if tag_id:
                        vcs_repo.apply_to_instance(tag_id)
                        vcs_results.append(f"Restored to '{ref}'")
                    else:
                        vcs_results.append(f"Tag '{ref}' not found")
                elif directive == "HISTORY":
                    history = vcs_repo.get_history(max_count=5)
                    lines = [f"  {h['id'][:8]}: {h['message']}" for h in history]
                    vcs_results.append("Recent history:\n" + "\n".join(lines))
            except Exception as vcs_err:
                vcs_results.append(f"VCS error: {vcs_err}")

        vcs_output = "; ".join(vcs_results) if vcs_results else None

        exec_code = remaining_code if remaining_code.strip() else code

        # VCS-only (no runnable code) — return early
        if directives and not exec_code.strip():
            emit_json({
                "step_idx": step_idx,
                "observation": obs_text,
                "observation_after": obs_text,
                "result": None,
                "error_occurred": False,
                "reward": 0.0,
                "production_score": 0.0,
                "achievements": [],
                "vcs": vcs_output,
            })
            return

        # ── Execute step ─────────────────────────────────────────────────
        action = Action(code=exec_code, agent_idx=0)
        obs_dict, reward, _terminated, _truncated, info = gym_env.step(action)

        result_text = info["result"]
        error_occurred = info["error_occurred"]
        production_score = info["production_score"]
        achievements = info.get("achievements") or []

        # Sanitise numpy scalars
        if hasattr(reward, 'item'):
            reward = reward.item()
        if hasattr(production_score, 'item'):
            production_score = production_score.item()

        # ── Post-step observation ────────────────────────────────────────
        post_obs = Observation.from_dict(obs_dict)
        obs_after_text = obs_formatter.format(post_obs).raw_str

        # ── VCS auto-commit ──────────────────────────────────────────────
        try:
            gs = GameState.from_instance(instance)
            vcs_repo.commit(gs, f"repl step {step_idx}: {'ERR' if error_occurred else 'OK'} score={production_score}", policy=exec_code)
        except Exception as e:
            print(f"VCS commit warning: {e}", file=sys.stderr)

        # ── Broker reporting ─────────────────────────────────────────────
        if run_id:
            report_step(
                broker_url, run_id, step_idx=step_idx,
                code=code,
                result=result_text,
                error_occurred=error_occurred,
                reward=reward,
                production_score=production_score,
                achievements=achievements,
            )

        # ── Emit result ──────────────────────────────────────────────────
        emit_json({
            "step_idx": step_idx,
            "observation": obs_text,
            "observation_after": obs_after_text,
            "result": result_text,
            "error_occurred": error_occurred,
            "reward": reward,
            "production_score": production_score,
            "achievements": achievements,
            "vcs": vcs_output,
        })

    except Exception as e:
        print(f"Fatal error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        emit_json({
            "step_idx": step_idx,
            "observation": None,
            "observation_after": None,
            "result": None,
            "error_occurred": True,
            "reward": 0.0,
            "production_score": 0.0,
            "achievements": [],
            "vcs": None,
            "error": str(e),
        })
        sys.exit(1)
    finally:
        if gym_env is not None:
            try:
                gym_env.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
