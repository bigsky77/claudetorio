import asyncio
from urllib.parse import urlparse

from ..config import config


def get_vtuber_stream_url(slot: int) -> str:
    """Derive the public HLS URL for a vtuber-streamer on the given replay slot."""
    parsed = urlparse(config.STREAM_URL)
    scheme = parsed.scheme or "http"
    host = config.GAME_SERVER_PUBLIC_HOST or parsed.hostname or parsed.path or "localhost"
    port = config.VTUBER_STREAM_BASE_PORT + slot
    return f"{scheme}://{host}:{port}/"


def get_game_stream_url_for_container(slot: int, public_url: str) -> str:
    """Return the replay stream URL accessible from inside the vtuber container.

    In dev (no STREAM_AGENT_URL), the stream-client-replay runs on the same
    Docker network, so use its container name directly.
    In prod (STREAM_AGENT_URL set), the stream-client is on a different host;
    use the public URL (accessible over the network).
    """
    if config.STREAM_AGENT_URL:
        return public_url
    return f"http://stream-client-replay-{slot}:3000/"


async def spawn_vtuber_container(
    run_id: str,
    slot: int,
    game_stream_url: str,
    anthropic_api_key: str,
    elevenlabs_api_key: str,
    rtmp_url: str | None = None,
    channel: str | None = None,
    platform: str | None = None,
) -> asyncio.subprocess.Process:
    """Spawn the vtuber-streamer Docker container for a replay.

    Always serves HLS on :3000 (mapped to VTUBER_STREAM_BASE_PORT + slot).
    Optionally also pushes to RTMP if rtmp_url is provided.
    Returns the subprocess.Process so the caller can monitor it.
    """
    container_name = f"vtuber-streamer-{run_id}"
    host_port = config.VTUBER_STREAM_BASE_PORT + slot

    cmd = ["docker", "run", "--rm", "--name", container_name]
    if config.DOCKER_NETWORK:
        cmd += ["--network", config.DOCKER_NETWORK]

    # Force Google DNS to avoid resolution failures in Ubuntu 24.04 containers
    cmd += ["--dns", "8.8.8.8"]

    # Expose HLS port to host
    cmd += ["-p", f"{host_port}:3000"]

    env_vars = {
        "RUN_ID": run_id,
        "BROKER_URL": "http://broker:8080",
        "GAME_STREAM_URL": game_stream_url,
        "ANTHROPIC_API_KEY": anthropic_api_key,
        "ELEVENLABS_API_KEY": elevenlabs_api_key,
    }
    if rtmp_url:
        env_vars["RTMP_URL"] = rtmp_url
    if channel:
        env_vars["VTUBER_CHANNEL"] = channel
    if platform:
        env_vars["VTUBER_PLATFORM"] = platform

    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]

    cmd += [config.VTUBER_STREAMER_IMAGE]

    print(f"[vtuber] Spawning {container_name} (HLS on :{host_port})", flush=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    return proc


async def stop_vtuber_container(run_id: str) -> None:
    """Stop the vtuber-streamer container (best-effort)."""
    container_name = f"vtuber-streamer-{run_id}"
    try:
        proc = await asyncio.create_subprocess_exec(
            "docker", "stop", "-t", "10", container_name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
    except Exception:
        pass
