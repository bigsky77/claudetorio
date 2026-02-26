import asyncio

import httpx
from mcrcon import MCRcon

from ..config import config
from .streaming import _stop_container, _stop_remote_container
from .vtuber_streaming import stop_vtuber_stream_client


def allocate_replay_slot(active_replays: dict) -> int | None:
    """Find first free replay slot (0-4) not currently in use."""
    used_slots = {v["slot"] for v in active_replays.values()}
    for slot in range(5):
        if slot not in used_slots:
            return slot
    return None


async def spawn_replay_factorio(run_id: str, slot: int, map_seed: int | None = None) -> bool:
    """Spawn a Factorio container for replay of run_id on replay slot.

    If map_seed is provided, the save is created with that seed so the replay
    uses the same map as the original run.
    Returns True if the container started successfully.
    """
    if not config.FACTORIO_IMAGE:
        print("[replay] ERROR: FACTORIO_IMAGE not configured", flush=True)
        return False

    container_name = f"factorio-replay-{run_id}"
    await _stop_container(container_name)
    await _remove_container(container_name)

    udp_port = config.REPLAY_UDP_BASE_PORT + slot
    rcon_port = config.REPLAY_RCON_BASE_PORT + slot

    cmd = ["docker", "run", "--platform", "linux/amd64", "-d", "--name", container_name, "--entrypoint", ""]

    if config.DOCKER_NETWORK:
        cmd += ["--network", config.DOCKER_NETWORK]

    # Per-replay isolated volume (fresh game state)
    cmd += ["-v", f"factorio-replay-{run_id}:/factorio"]

    # Config volume
    if config.FACTORIO_CONFIG_VOLUME:
        cmd += ["-v", f"{config.FACTORIO_CONFIG_VOLUME}:/opt/factorio/config"]
    elif config.FACTORIO_CONFIG_PATH:
        cmd += ["-v", f"{config.FACTORIO_CONFIG_PATH}:/opt/factorio/config"]

    # Scenarios volume
    if config.FACTORIO_SCENARIOS_VOLUME:
        cmd += ["-v", f"{config.FACTORIO_SCENARIOS_VOLUME}:/factorio/scenarios"]
    elif config.FACTORIO_SCENARIOS_PATH:
        cmd += ["-v", f"{config.FACTORIO_SCENARIOS_PATH}:/factorio/scenarios"]

    # Expose ports to host so stream-clients on stream-server can reach this container
    cmd += ["-p", f"{udp_port}:{udp_port}/udp"]
    cmd += ["-p", f"{rcon_port}:{rcon_port}"]

    cmd += [config.FACTORIO_IMAGE]

    factorio_bin = "/opt/factorio/bin/x64/factorio"
    save_path = "/factorio/saves/game.zip"

    if map_seed is not None:
        create_cmd = (
            f"{factorio_bin} --create {save_path}"
            f" --map-gen-settings /opt/factorio/config/map-gen-settings.json"
            f" --map-settings /opt/factorio/config/map-settings.json"
            f" --map-gen-seed {map_seed}"
        )
        print(f"[replay] Using seed {map_seed} for {run_id}", flush=True)
    else:
        create_cmd = (
            f"{factorio_bin} --create {save_path}"
            f" --map-gen-settings /opt/factorio/config/map-gen-settings.json"
            f" --map-settings /opt/factorio/config/map-settings.json"
        )

    shell_cmd = (
        f"{create_cmd}"
        f" && {factorio_bin}"
        f" --start-server {save_path}"
        f" --port {udp_port}"
        f" --rcon-port {rcon_port}"
        f" --rcon-password {config.RCON_PASSWORD}"
        f" --server-settings /opt/factorio/config/server-settings.json"
        f" --server-adminlist /opt/factorio/config/server-adminlist.json"
        f" --server-banlist /opt/factorio/config/server-banlist.json"
    )
    cmd += ["sh", "-c", shell_cmd]

    print(f"[replay] Spawning {container_name} (slot={slot}, udp={udp_port}, rcon={rcon_port})", flush=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = (stderr or stdout or b"").decode(errors="replace").strip()
        print(f"[replay] Failed to spawn {container_name}: {err}", flush=True)
        return False

    await asyncio.sleep(3)
    alive = await _is_container_running(container_name)
    if not alive:
        print(f"[replay] {container_name} exited immediately", flush=True)
        await _remove_container(container_name)
        return False

    print(f"[replay] {container_name} started", flush=True)
    return True


async def wait_for_replay_factorio(run_id: str, slot: int, timeout: int = 120) -> bool:
    """Poll RCON on the replay Factorio container until it's ready."""
    host = f"factorio-replay-{run_id}"
    port = config.REPLAY_RCON_BASE_PORT + slot
    print(f"[replay] Waiting for {host} RCON on port {port}...", flush=True)
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            rcon = MCRcon(host, config.RCON_PASSWORD, port=port)
            rcon.connect()
            rcon.disconnect()
            print(f"[replay] {host} RCON ready", flush=True)
            return True
        except Exception:
            await asyncio.sleep(2)
    print(f"[replay] WARNING: {host} RCON not ready after {timeout}s", flush=True)
    return False


async def spawn_replay_stream_client(run_id: str, slot: int) -> bool:
    """Spawn a stream-client container for the replay.

    Returns True if the container started successfully.
    """
    if config.STREAM_AGENT_URL:
        # Remote path: delegate to stream-agent on stream-server
        factorio_host = config.GAME_SERVER_PUBLIC_HOST
        udp_port = config.REPLAY_UDP_BASE_PORT + slot
        host_port = config.REPLAY_STREAM_BASE_PORT + slot
        container_name = f"stream-client-replay-{slot}"
        print(
            f"[replay] calling stream-agent to spawn {container_name} "
            f"({factorio_host}:{udp_port} -> :{host_port})",
            flush=True,
        )
        env_vars: dict[str, str] = {}
        if config.TWITCH_STREAM_KEY:
            env_vars["TWITCH_STREAM_KEY"] = config.TWITCH_STREAM_KEY
        if config.KICK_STREAM_KEY:
            env_vars["KICK_STREAM_KEY"] = config.KICK_STREAM_KEY

        try:
            async with httpx.AsyncClient() as client:
                body: dict = {
                    "container_name": container_name,
                    "factorio_host": factorio_host,
                    "factorio_port": udp_port,
                    "host_port": host_port,
                    "title": f"ClaudeTorio Replay {run_id}",
                    "image": config.STREAM_CLIENT_IMAGE,
                    "client_volume": config.FACTORIO_CLIENT_VOLUME,
                }
                if env_vars:
                    body["env_vars"] = env_vars
                r = await client.post(
                    f"{config.STREAM_AGENT_URL}/spawn/stream-client",
                    json=body,
                    headers={"X-Stream-Agent-Key": config.STREAM_AGENT_KEY},
                    timeout=130.0,
                )
            if r.status_code == 200:
                print(f"[replay] stream-agent spawned {container_name}", flush=True)
                return True
            else:
                print(
                    f"[replay] stream-agent returned {r.status_code} for {container_name}: {r.text}",
                    flush=True,
                )
                return False
        except Exception as e:
            print(f"[replay] ERROR calling stream-agent for {container_name}: {e}", flush=True)
            return False

    # Local path (dev / no stream-agent configured)
    if not config.FACTORIO_CLIENT_PATH and not config.FACTORIO_CLIENT_VOLUME:
        print("[replay] WARNING: streaming disabled — FACTORIO_CLIENT_PATH/VOLUME not set", flush=True)
        return False

    container_name = f"stream-client-replay-{slot}"
    await _stop_container(container_name)

    network = config.STREAM_CLIENT_NETWORK or config.DOCKER_NETWORK
    factorio_host = f"factorio-replay-{run_id}"
    udp_port = config.REPLAY_UDP_BASE_PORT + slot
    host_port = config.REPLAY_STREAM_BASE_PORT + slot

    env_vars = {
        "SERVER_HOST": factorio_host,
        "SERVER_PORT": str(udp_port),
        "TITLE": f"ClaudeTorio Replay {run_id}",
        "CUSTOM_USER": "viewer",
        "DISPLAY_WIDTH": "1280",
        "DISPLAY_HEIGHT": "720",
        "DISPLAY_REFRESH_RATE": "30",
        "PUID": "1000",
        "PGID": "1000",
        "TZ": "UTC",
    }
    if config.TWITCH_STREAM_KEY:
        env_vars["TWITCH_STREAM_KEY"] = config.TWITCH_STREAM_KEY
    if config.KICK_STREAM_KEY:
        env_vars["KICK_STREAM_KEY"] = config.KICK_STREAM_KEY

    cmd = ["docker", "run", "--platform", "linux/amd64", "-d", "--rm", "--name", container_name]
    if network:
        cmd += ["--network", network]
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]

    if config.FACTORIO_CLIENT_VOLUME:
        cmd += ["-v", f"{config.FACTORIO_CLIENT_VOLUME}:/opt/factorio"]
    elif config.FACTORIO_CLIENT_PATH:
        cmd += ["-v", f"{config.FACTORIO_CLIENT_PATH}:/opt/factorio"]

    cmd += ["-p", f"{host_port}:3000"]
    cmd += [config.STREAM_CLIENT_IMAGE]

    print(f"[replay] Spawning {container_name}: SERVER_HOST={factorio_host} port={host_port}", flush=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = (stderr or stdout or b"").decode().strip()
        print(f"[replay] ERROR spawning {container_name}: {err}", flush=True)
        return False

    print(f"[replay] Started {container_name}", flush=True)
    return True


async def wait_for_replay_stream_client(run_id: str, slot: int, timeout: int = 90) -> bool:
    """Poll until the replay stream-client KasmVNC port is accepting connections."""
    if config.STREAM_AGENT_URL:
        # stream-agent already blocked until ready; nothing to do here
        return True

    container_name = f"stream-client-replay-{slot}"
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            reader, writer = await asyncio.open_connection(container_name, 3000)
            writer.close()
            await writer.wait_closed()
            print(f"[replay] {container_name} is ready", flush=True)
            return True
        except Exception:
            await asyncio.sleep(2)
    print(f"[replay] WARNING: {container_name} not ready after {timeout}s", flush=True)
    return False


async def spawn_stream_worker_container(
    run_id: str,
    slot: int,
    broker_url: str,
) -> asyncio.subprocess.Process:
    """Spawn the stream-worker Docker container for replay.

    Returns the subprocess.Process so the caller can monitor it.
    """
    container_name = f"stream-worker-{run_id}"
    rcon_port = config.REPLAY_RCON_BASE_PORT + slot
    server_host = f"factorio-replay-{run_id}"

    cmd = ["docker", "run", "--platform", "linux/amd64", "--rm", "--name", container_name]
    if config.DOCKER_NETWORK:
        cmd += ["--network", config.DOCKER_NETWORK]

    env_vars = {
        "RUN_ID": run_id,
        "BROKER_URL": broker_url,
        "SERVER_HOST": server_host,
        "RCON_PORT": str(rcon_port),
        "RCON_PASSWORD": config.RCON_PASSWORD,
        "FLE_RCON_HOST": server_host,
        "FLE_RCON_PORT": str(rcon_port),
        "FLE_RCON_PASSWORD": config.RCON_PASSWORD,
        "RUN_WORKER_API_KEY": config.RUN_WORKER_API_KEY,
        "STEP_INTERVAL": str(config.STEP_INTERVAL),
    }
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]

    cmd += [config.STREAM_WORKER_IMAGE]

    print(f"[replay] Spawning {container_name}", flush=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    return proc


async def stop_replay_containers(run_id: str, slot: int | None = None) -> None:
    """Stop all containers for a replay (best-effort)."""
    # Stop VTuber container if it's running (best-effort)
    await stop_vtuber_stream_client(run_id)

    # stream-worker and factorio-replay always run on game-server
    for name in [f"stream-worker-{run_id}", f"factorio-replay-{run_id}"]:
        await _stop_container(name)

    # stream-client-replay is named by slot so Caddy can route to it
    if slot is not None:
        stream_client_name = f"stream-client-replay-{slot}"
        if config.STREAM_AGENT_URL:
            await _stop_remote_container(stream_client_name)
        else:
            await _stop_container(stream_client_name)

    # Remove the factorio replay container (it has no --rm)
    await _remove_container(f"factorio-replay-{run_id}")


async def _is_container_running(name: str) -> bool:
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "inspect", "-f", "{{.State.Running}}", name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        return stdout.decode().strip() == "true"
    except Exception:
        return False


async def _remove_container(name: str) -> None:
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "rm", "-f", name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
    except Exception:
        pass
