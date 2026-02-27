import asyncio

import httpx

from ..config import config


async def spawn_stream_client(
    slot: int,
    factorio_host: str | None = None,
) -> str | None:
    """Spawn a stream-client Docker container for the given slot.

    Returns the short container ID (or "remote"), or None if streaming is
    disabled or the container failed to start.
    """
    if config.STREAM_AGENT_URL:
        # Remote path: delegate to stream-agent on stream-server
        server_host = config.GAME_SERVER_PUBLIC_HOST or f"factorio-{slot}"
        udp_port = config.get_udp_port(slot)
        host_port = config.STREAM_BASE_PORT + slot
        print(
            f"[streaming] calling stream-agent to spawn stream-client-{slot} "
            f"({server_host}:{udp_port} -> :{host_port})",
            flush=True,
        )
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{config.STREAM_AGENT_URL}/spawn/stream-client",
                    json={
                        "container_name": f"stream-client-{slot}",
                        "factorio_host": server_host,
                        "factorio_port": udp_port,
                        "host_port": host_port,
                        "title": f"ClaudeTorio Slot {slot}",
                        "image": config.STREAM_CLIENT_IMAGE,
                        "client_volume": config.FACTORIO_CLIENT_VOLUME,
                    },
                    headers={"X-Stream-Agent-Key": config.STREAM_AGENT_KEY},
                    timeout=130.0,
                )
            if r.status_code == 200:
                print(f"[streaming] stream-agent spawned stream-client-{slot}", flush=True)
                return "remote"
            else:
                print(
                    f"[streaming] stream-agent returned {r.status_code} for stream-client-{slot}: {r.text}",
                    flush=True,
                )
                return None
        except Exception as e:
            print(f"[streaming] ERROR calling stream-agent for stream-client-{slot}: {e}", flush=True)
            return None

    # Local path (dev / no stream-agent configured)
    if not config.FACTORIO_CLIENT_PATH and not config.FACTORIO_CLIENT_VOLUME:
        print("[streaming] WARNING: streaming disabled — neither FACTORIO_CLIENT_PATH nor FACTORIO_CLIENT_VOLUME is set", flush=True)
        return None

    container_name = f"stream-client-{slot}"

    # Stop any existing container for this slot (best-effort)
    await _stop_container(container_name)

    network = config.STREAM_CLIENT_NETWORK or config.DOCKER_NETWORK

    server_host = factorio_host or f"factorio-{slot}"
    udp_port = config.get_udp_port(slot)
    env_vars = {
        "SERVER_HOST": server_host,
        "SERVER_PORT": str(udp_port),
        "TITLE": f"ClaudeTorio Slot {slot}",
        "CUSTOM_USER": "viewer",
        "DISPLAY_WIDTH": "1280",
        "DISPLAY_HEIGHT": "720",
        "DISPLAY_REFRESH_RATE": "30",
        "PUID": "1000",
        "PGID": "1000",
        "TZ": "UTC",
    }

    cmd = ["docker", "run", "--platform", "linux/amd64", "-d", "--rm", "--name", container_name]

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

    # Port-based public routing: slot N -> STREAM_BASE_PORT + N
    host_port = config.STREAM_BASE_PORT + slot
    cmd += ["-p", f"{host_port}:3000"]

    cmd += [config.STREAM_CLIENT_IMAGE]

    print(f"[streaming] Spawning {container_name}: SERVER_HOST={server_host} SERVER_PORT={udp_port}", flush=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = (stderr or stdout or b"").decode().strip()
        print(f"[streaming] ERROR spawning {container_name}: {err}", flush=True)
        return None

    container_id = stdout.decode().strip()[:12]
    print(f"[streaming] Started {container_name} (container {container_id})", flush=True)
    return container_id


async def wait_for_stream_client(slot: int, timeout: int = 120) -> bool:
    """Poll until the stream-client KasmVNC port is accepting connections."""
    if config.STREAM_AGENT_URL:
        # stream-agent already blocked until ready; nothing to do here
        return True

    container_name = f"stream-client-{slot}"
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            reader, writer = await asyncio.open_connection(container_name, 3000)
            writer.close()
            await writer.wait_closed()
            print(f"[streaming] {container_name} is ready", flush=True)
            return True
        except Exception:
            await asyncio.sleep(2)
    print(f"[streaming] WARNING: {container_name} not ready after {timeout}s", flush=True)
    return False


async def stop_stream_client(slot: int) -> None:
    """Stop the stream-client container for the given slot (best-effort)."""
    container_name = f"stream-client-{slot}"
    if config.STREAM_AGENT_URL:
        await _stop_remote_container(container_name)
        return
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


async def start_rtmp(container_name: str) -> bool:
    """Start RTMP push on a stream-client container."""
    if config.STREAM_AGENT_URL:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{config.STREAM_AGENT_URL}/containers/{container_name}/rtmp/start",
                    headers={"X-Stream-Agent-Key": config.STREAM_AGENT_KEY},
                    timeout=30.0,
                )
            if r.status_code == 200:
                return True
            print(f"[streaming] stream-agent rtmp/start returned {r.status_code}: {r.text}", flush=True)
            return False
        except Exception as e:
            print(f"[streaming] ERROR calling stream-agent rtmp/start for {container_name}: {e}", flush=True)
            return False

    # Local path: docker exec
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", container_name, "/scripts/start-rtmp.sh",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            print(f"[streaming] ERROR starting RTMP on {container_name}: {stderr.decode().strip()}", flush=True)
            return False
        return True
    except Exception as e:
        print(f"[streaming] ERROR starting RTMP on {container_name}: {e}", flush=True)
        return False


async def stop_rtmp(container_name: str) -> bool:
    """Stop RTMP push on a stream-client container."""
    if config.STREAM_AGENT_URL:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{config.STREAM_AGENT_URL}/containers/{container_name}/rtmp/stop",
                    headers={"X-Stream-Agent-Key": config.STREAM_AGENT_KEY},
                    timeout=30.0,
                )
            if r.status_code == 200:
                return True
            print(f"[streaming] stream-agent rtmp/stop returned {r.status_code}: {r.text}", flush=True)
            return False
        except Exception as e:
            print(f"[streaming] ERROR calling stream-agent rtmp/stop for {container_name}: {e}", flush=True)
            return False

    # Local path: docker exec
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", container_name, "/scripts/stop-rtmp.sh",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0:
            print(f"[streaming] ERROR stopping RTMP on {container_name}: {stderr.decode().strip()}", flush=True)
            return False
        return True
    except Exception as e:
        print(f"[streaming] ERROR stopping RTMP on {container_name}: {e}", flush=True)
        return False


async def _stop_remote_container(container_name: str) -> None:
    """Call stream-agent to stop a remote container (best-effort)."""
    try:
        async with httpx.AsyncClient() as client:
            await client.delete(
                f"{config.STREAM_AGENT_URL}/containers/{container_name}",
                headers={"X-Stream-Agent-Key": config.STREAM_AGENT_KEY},
                timeout=30.0,
            )
    except Exception as e:
        print(f"[streaming] WARNING: stream-agent DELETE {container_name} failed: {e}", flush=True)


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
