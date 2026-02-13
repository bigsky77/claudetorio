import asyncio

from ..config import config


async def spawn_stream_client(
    slot: int,
    factorio_host: str | None = None,
) -> asyncio.subprocess.Process | None:
    """Spawn a stream-client Docker container for the given slot.

    Returns the process, or None if FACTORIO_CLIENT_PATH is not configured
    (streaming disabled).
    """
    if not config.FACTORIO_CLIENT_PATH and not config.FACTORIO_CLIENT_VOLUME:
        return None

    container_name = f"stream-client-{slot}"

    # Stop any existing container for this slot (best-effort)
    await _stop_container(container_name)

    network = config.STREAM_CLIENT_NETWORK or config.DOCKER_NETWORK

    server_host = factorio_host or f"factorio-{slot}"
    env_vars = {
        "SERVER_HOST": server_host,
        "SERVER_PORT": str(config.BASE_UDP_PORT),
        "TITLE": f"ClaudeTorio Slot {slot}",
        "CUSTOM_USER": "viewer",
        "DISPLAY_WIDTH": "1280",
        "DISPLAY_HEIGHT": "720",
        "DISPLAY_REFRESH_RATE": "30",
        "PUID": "1000",
        "PGID": "1000",
        "TZ": "UTC",
    }

    cmd = ["docker", "run", "--rm", "--name", container_name]

    if network:
        cmd += ["--network", network]

    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]

    # Mount Factorio client binary
    if config.FACTORIO_CLIENT_VOLUME:
        cmd += ["-v", f"{config.FACTORIO_CLIENT_VOLUME}:/opt/factorio"]
    elif config.FACTORIO_CLIENT_PATH:
        cmd += ["-v", f"{config.FACTORIO_CLIENT_PATH}:/opt/factorio"]

    # Keep runtime config container-local to avoid shared-write conflicts.
    # The startup script copies base config from /opt/factorio/config into
    # /config/factorio-data for this instance.

    if config.STREAM_DOMAIN:
        # Prod: Caddy routes via Docker DNS, only expose internally
        cmd += ["--expose", "3000"]
    else:
        # Dev: port-based routing
        host_port = config.STREAM_BASE_PORT + slot
        cmd += ["-p", f"{host_port}:3000"]

    cmd += [config.STREAM_CLIENT_IMAGE]

    print(f"[streaming] Spawning {container_name}: SERVER_HOST={server_host} SERVER_PORT={config.BASE_UDP_PORT}", flush=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    return proc


async def stop_stream_client(slot: int) -> None:
    """Stop the stream-client container for the given slot (best-effort)."""
    container_name = f"stream-client-{slot}"
    await _stop_container(container_name)


async def is_stream_client_running(slot: int) -> bool:
    """Check if the stream-client container for this slot is running."""
    container_name = f"stream-client-{slot}"
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "inspect", "-f", "{{.State.Running}}", container_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout, _ = await proc.communicate()
        return stdout.decode().strip() == "true"
    except Exception:
        return False


async def _stop_container(name: str) -> None:
    """Stop a Docker container by name, ignoring errors."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "stop", "-t", "5", name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
    except Exception:
        pass
