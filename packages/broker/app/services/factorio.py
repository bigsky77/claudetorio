import asyncio

from mcrcon import MCRcon

from ..config import config


async def spawn_factorio(slot: int) -> str | None:
    """Spawn a Factorio server container for the given slot.

    Returns the container ID, or None if not configured or spawn failed.
    """
    if not config.FACTORIO_IMAGE:
        return None

    container_name = f"factorio-{slot}"

    # Stop and remove any existing container for this slot (best-effort)
    await stop_factorio(slot)

    env_vars = {
        "GENERATE_NEW_SAVE": "true",
        "SAVE_NAME": f"slot_{slot}",
        "RCON_PASSWORD": config.RCON_PASSWORD,
    }

    cmd = ["docker", "run", "-d", "--name", container_name]

    if config.DOCKER_NETWORK:
        cmd += ["--network", config.DOCKER_NETWORK]

    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]

    # Per-slot data volume
    cmd += ["-v", f"factorio-slot-{slot}:/factorio"]

    # Mount config directory — prefer named volume, fall back to host path
    if config.FACTORIO_CONFIG_VOLUME:
        cmd += ["-v", f"{config.FACTORIO_CONFIG_VOLUME}:/factorio/config"]
    elif config.FACTORIO_CONFIG_PATH:
        cmd += ["-v", f"{config.FACTORIO_CONFIG_PATH}:/factorio/config"]

    cmd += [config.FACTORIO_IMAGE]

    print(f"[factorio] Spawning {container_name}: {' '.join(cmd)}", flush=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = (stderr or stdout or b"").decode(errors="replace").strip()
        print(f"[factorio] Failed to spawn {container_name} (exit {proc.returncode}): {err}", flush=True)
        return None

    container_id = stdout.decode().strip()[:12]
    print(f"[factorio] {container_name} started (id={container_id})", flush=True)

    # Give it a moment, then check if it crashed immediately
    await asyncio.sleep(3)
    alive = await _is_container_running(container_name)
    if not alive:
        logs = await _get_container_logs(container_name)
        print(f"[factorio] {container_name} exited immediately. Logs:\n{logs}", flush=True)
        await _remove_container(container_name)
        return None

    return container_id


async def stop_factorio(slot: int) -> None:
    """Stop and remove the Factorio container for the given slot (best-effort)."""
    container_name = f"factorio-{slot}"
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "stop", "-t", "10", container_name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
    except Exception:
        pass
    await _remove_container(container_name)


async def _remove_container(name: str) -> None:
    """Remove a Docker container by name, ignoring errors."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "rm", "-f", name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
    except Exception:
        pass


async def _is_container_running(name: str) -> bool:
    """Check if a Docker container is running."""
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


async def _get_container_logs(name: str, tail: int = 50) -> str:
    """Get recent logs from a container."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "logs", "--tail", str(tail), name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        stdout, _ = await proc.communicate()
        return stdout.decode(errors="replace").strip()
    except Exception as e:
        return f"(failed to get logs: {e})"


async def wait_for_factorio(slot: int, timeout: int = 180, retries: int = 3, retry_interval: int = 180) -> bool:
    """Wait for Factorio RCON to become available.

    Tries up to `retries` times, each with `timeout` seconds of polling,
    waiting `retry_interval` seconds between attempts.
    Returns True if connection succeeded, False after all retries exhausted.
    """
    host = f"factorio-{slot}"
    port = config.BASE_RCON_PORT

    for attempt in range(1, retries + 1):
        print(f"[factorio] Waiting for {host} RCON (attempt {attempt}/{retries})...", flush=True)
        deadline = asyncio.get_event_loop().time() + timeout

        while asyncio.get_event_loop().time() < deadline:
            try:
                rcon = MCRcon(host, config.RCON_PASSWORD, port=port)
                rcon.connect()
                rcon.disconnect()
                print(f"[factorio] {host} RCON ready", flush=True)
                return True
            except Exception:
                await asyncio.sleep(2)

        if attempt < retries:
            print(f"[factorio] {host} RCON not ready after {timeout}s, retrying in {retry_interval}s...", flush=True)
            await asyncio.sleep(retry_interval)

    print(f"[factorio] {host} RCON failed after {retries} attempts", flush=True)
    return False
