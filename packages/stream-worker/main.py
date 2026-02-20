import os
import time
import httpx
from dotenv import load_dotenv

# Load env before FLE imports (FLE reads env at module load time)
load_dotenv()

RUN_ID = os.environ["RUN_ID"]
BROKER_URL = os.environ["BROKER_URL"]
RUN_WORKER_API_KEY = os.environ["RUN_WORKER_API_KEY"]
SERVER_HOST = os.environ["SERVER_HOST"]
RCON_PORT = int(os.environ["RCON_PORT"])
RCON_PASSWORD = os.getenv("RCON_PASSWORD", "factorio")
STEP_INTERVAL = float(os.getenv("STEP_INTERVAL", "5.0"))
POLL_INTERVAL = float(os.getenv("POLL_INTERVAL", "10.0"))
CAMERA_ZOOM = float(os.getenv("CAMERA_ZOOM", "0.5"))

# Set FLE env vars before importing FLE
os.environ["FLE_RCON_HOST"] = SERVER_HOST
os.environ["FLE_RCON_PORT"] = str(RCON_PORT)
os.environ["FLE_RCON_PASSWORD"] = RCON_PASSWORD


def fetch_steps_since(after_step_idx: int) -> list[dict]:
    """Fetch one page (up to 500) of steps after the given index."""
    with httpx.Client() as client:
        resp = client.get(
            f"{BROKER_URL}/api/runs/{RUN_ID}/steps",
            params={"limit": 500, "after_step_idx": after_step_idx},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()


def fetch_run_status() -> str:
    """Fetch the run's current status string from the broker."""
    with httpx.Client() as client:
        resp = client.get(f"{BROKER_URL}/api/runs/{RUN_ID}", timeout=30)
        resp.raise_for_status()
        return resp.json()["status"]


def follow_agent(rcon_client) -> None:
    """Move all connected spectators' cameras to the agent character."""
    cmd = (
        "/sc local char = global.agent_characters and global.agent_characters[1];"
        " for _, p in pairs(game.connected_players) do"
        " p.game_view_settings.show_controller_gui = false;"
        " p.game_view_settings.show_fog_of_war = false;"
        " p.game_view_settings.show_minimap = false;"
        " p.game_view_settings.show_research_info = false;"
        " p.game_view_settings.show_entity_info = false;"
        " p.game_view_settings.show_alert_gui = false;"
        " p.game_view_settings.update_entity_selection = false;"
        " p.game_view_settings.show_side_menu = false;"
        " if char and char.valid then"
        " p.teleport(char.position, char.surface);"
        f" p.zoom_to_world(char.position, {CAMERA_ZOOM})"
        " end end"
    )
    try:
        rcon_client.send_command(cmd)
    except Exception as e:
        print(f"[stream-worker] Camera follow error: {e}", flush=True)


def main():
    print(f"[stream-worker] Starting replay for run {RUN_ID}", flush=True)
    print(f"[stream-worker] Connecting to {SERVER_HOST}:{RCON_PORT}", flush=True)

    # RCON warmup — dismiss achievements warning before FLE init
    from factorio_rcon import RCONClient as _WarmupRCON
    for attempt in range(3):
        try:
            _warmup = _WarmupRCON(SERVER_HOST, RCON_PORT, RCON_PASSWORD)
            _warmup.send_command("/sc rcon.print('warmup')")
            _warmup.send_command("/sc rcon.print('warmup')")
            _warmup.close()
            print("[stream-worker] RCON warmup OK", flush=True)
            break
        except Exception as e:
            print(f"[stream-worker] RCON warmup attempt {attempt + 1} failed: {e}", flush=True)
            time.sleep(2)

    # Patch RCONClient to avoid double-connect issue in FLE
    from factorio_rcon import RCONClient as _OrigRCON
    _orig_init = _OrigRCON.__init__

    def _patched_init(self, ip_address, port, password, timeout=None, connect_on_init=False):
        _orig_init(self, ip_address, port, password, timeout=timeout, connect_on_init=connect_on_init)

    _OrigRCON.__init__ = _patched_init

    from fle.env.instance import FactorioInstance
    print(f"[stream-worker] Initializing FactorioInstance at {SERVER_HOST}:{RCON_PORT}...", flush=True)
    instance = FactorioInstance(
        address=SERVER_HOST,
        tcp_port=RCON_PORT,
        fast=True,
        all_technologies_researched=False,
        clear_entities=False,
    )

    TERMINAL_STATUSES = {"completed", "failed", "stopped"}
    last_step_idx = -1

    while True:
        steps = fetch_steps_since(last_step_idx)

        if steps:
            for step in steps:
                print(f"[stream-worker] Replaying step {step['step_idx']}", flush=True)
                try:
                    result = instance.eval(step["code"])
                    print(f"[stream-worker] Step {step['step_idx']} result: {result}", flush=True)
                except Exception as e:
                    print(f"[stream-worker] Step {step['step_idx']} error: {e}", flush=True)
                last_step_idx = step["step_idx"]
                follow_agent(instance.rcon_client)
                time.sleep(STEP_INTERVAL)
            # Don't sleep — immediately try to fetch more steps
            continue

        # No new steps — check whether the run is done
        try:
            status = fetch_run_status()
        except Exception as e:
            print(f"[stream-worker] Could not fetch run status: {e}", flush=True)
            status = "unknown"

        if status in TERMINAL_STATUSES:
            print(f"[stream-worker] Run {RUN_ID} is {status}, exiting", flush=True)
            break

        print(f"[stream-worker] No new steps (run={status}), polling in {POLL_INTERVAL}s", flush=True)
        follow_agent(instance.rcon_client)
        time.sleep(POLL_INTERVAL)

    print(f"[stream-worker] Replay complete for run {RUN_ID}", flush=True)


if __name__ == "__main__":
    main()
