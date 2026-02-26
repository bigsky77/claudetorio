import asyncio

import httpx

from ..config import config


async def spawn_vtuber_stream_client(
    run_id: str,
    slot: int,
    factorio_stream_url: str,
) -> bool:
    """Spawn a vtuber-stream-client container for the given replay run.

    Returns True if the container started successfully, False otherwise.
    """
    container_name = f"vtuber-stream-client-replay-{run_id}"
    host_port = config.VTUBER_STREAM_BASE_PORT + slot

    if config.STREAM_AGENT_URL:
        print(
            f"[vtuber] calling stream-agent to spawn {container_name} "
            f"(factorio_stream_url={factorio_stream_url} -> :{host_port})",
            flush=True,
        )
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    f"{config.STREAM_AGENT_URL}/spawn/vtuber-stream-client",
                    json={
                        "container_name": container_name,
                        "factorio_stream_url": factorio_stream_url,
                        "host_port": host_port,
                        "image": config.VTUBER_STREAM_CLIENT_IMAGE,
                        "env_vars": {
                            "TWITCH_STREAM_KEY": config.TWITCH_STREAM_KEY,
                            "KICK_STREAM_KEY": config.KICK_STREAM_KEY,
                            "ANTHROPIC_API_KEY": config.ANTHROPIC_API_KEY,
                            "ELEVENLABS_API_KEY": config.ELEVENLABS_API_KEY,
                        },
                    },
                    headers={"X-Stream-Agent-Key": config.STREAM_AGENT_KEY},
                    timeout=180.0,
                )
            if r.status_code == 200:
                print(f"[vtuber] stream-agent spawned {container_name}", flush=True)
                return True
            print(
                f"[vtuber] stream-agent returned {r.status_code} for {container_name}: {r.text}",
                flush=True,
            )
            return False
        except Exception as e:
            print(f"[vtuber] ERROR calling stream-agent for {container_name}: {e}", flush=True)
            return False

    # Local path (dev / no stream-agent configured)
    await _stop_container(container_name)

    network = config.DOCKER_NETWORK

    env_vars = {
        "FACTORIO_STREAM_URL": factorio_stream_url,
        "TWITCH_STREAM_KEY": config.TWITCH_STREAM_KEY,
        "KICK_STREAM_KEY": config.KICK_STREAM_KEY,
        "ANTHROPIC_API_KEY": config.ANTHROPIC_API_KEY,
        "ELEVENLABS_API_KEY": config.ELEVENLABS_API_KEY,
    }

    cmd = [
        "docker", "run", "--platform", "linux/amd64",
        "-d", "--rm", "--name", container_name,
        "--shm-size", "2g",
    ]
    if network:
        cmd += ["--network", network]
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]
    cmd += [config.VTUBER_STREAM_CLIENT_IMAGE]

    print(
        f"[vtuber] Spawning {container_name}: FACTORIO_STREAM_URL={factorio_stream_url}",
        flush=True,
    )

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()

    if proc.returncode != 0:
        err = (stderr or stdout or b"").decode().strip()
        print(f"[vtuber] ERROR spawning {container_name}: {err}", flush=True)
        return False

    container_id = stdout.decode().strip()[:12]
    print(f"[vtuber] Started {container_name} (container {container_id})", flush=True)
    return True


async def wait_for_vtuber_stream_client(run_id: str, timeout: int = 180) -> bool:
    """Poll until the vtuber-stream-client has written the /tmp/streaming sentinel."""
    if config.STREAM_AGENT_URL:
        # stream-agent already blocked until ready
        return True

    container_name = f"vtuber-stream-client-replay-{run_id}"
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", container_name, "test", "-f", "/tmp/streaming",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode == 0:
            print(f"[vtuber] {container_name} streaming to RTMP", flush=True)
            return True
        await asyncio.sleep(3)

    print(f"[vtuber] WARNING: {container_name} not ready after {timeout}s", flush=True)
    return False


async def stop_vtuber_stream_client(run_id: str) -> None:
    """Stop the vtuber-stream-client container for the given run (best-effort)."""
    container_name = f"vtuber-stream-client-replay-{run_id}"
    if config.STREAM_AGENT_URL:
        await _stop_remote_container(container_name)
        return
    await _stop_container(container_name)


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
        print(f"[vtuber] WARNING: stream-agent DELETE {container_name} failed: {e}", flush=True)


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
