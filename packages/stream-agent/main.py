import asyncio
import os
import shutil

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

STREAM_AGENT_KEY = os.getenv("STREAM_AGENT_KEY", "")
DOCKER_NETWORK = os.getenv("DOCKER_NETWORK", "stream-network")
STREAM_CLIENT_IMAGE = os.getenv("STREAM_CLIENT_IMAGE", "claudetorio-stream-client")
FACTORIO_CLIENT_VOLUME = os.getenv("FACTORIO_CLIENT_VOLUME", "claudetorio_factorio_client")
HLS_READY_TIMEOUT_SECONDS = 180


def require_auth(x_stream_agent_key: str = Header(...)):
    if STREAM_AGENT_KEY and x_stream_agent_key != STREAM_AGENT_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


app = FastAPI()


@app.get("/health")
async def health():
    return {"ok": True}


class SpawnRequest(BaseModel):
    container_name: str
    factorio_host: str
    factorio_port: int
    host_port: int
    title: str
    image: str = ""
    client_volume: str = ""
    env_vars: dict = {}


@app.post("/spawn/stream-client")
async def spawn_stream_client(req: SpawnRequest, _=Depends(require_auth)):
    _ensure_docker_available()

    image = req.image or STREAM_CLIENT_IMAGE
    client_volume = req.client_volume or FACTORIO_CLIENT_VOLUME

    # Stop any existing container with this name (best-effort)
    await _stop_container(req.container_name)

    env_vars = {
        "SERVER_HOST": req.factorio_host,
        "SERVER_PORT": str(req.factorio_port),
        "DISPLAY_WIDTH": "1280",
        "DISPLAY_HEIGHT": "720",
    }
    # Merge any extra env vars from the request (e.g. stream keys)
    env_vars.update(req.env_vars)

    cmd = ["docker", "run", "-d", "--rm", "--name", req.container_name]
    if DOCKER_NETWORK:
        cmd += ["--network", DOCKER_NETWORK]
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]
    if client_volume:
        cmd += ["-v", f"{client_volume}:/opt/factorio"]
    cmd += ["-p", f"{req.host_port}:3000"]
    cmd += [image]

    print(
        f"[stream-agent] Spawning {req.container_name}: "
        f"{req.factorio_host}:{req.factorio_port} -> :{req.host_port}",
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
        print(f"[stream-agent] ERROR spawning {req.container_name}: {err}", flush=True)
        raise HTTPException(status_code=500, detail=f"Failed to spawn container: {err}")

    container_id = stdout.decode().strip()[:12]
    print(
        f"[stream-agent] Started {req.container_name} ({container_id}), waiting for port 3000...",
        flush=True,
    )

    ready = await _wait_for_port(req.container_name, 3000, timeout=HLS_READY_TIMEOUT_SECONDS)
    if not ready:
        raise HTTPException(status_code=504, detail="Container port 3000 not ready in time")

    hls_ready = await _wait_for_hls_manifest(req.container_name, timeout=HLS_READY_TIMEOUT_SECONDS)
    if not hls_ready:
        raise HTTPException(status_code=504, detail="HLS manifest not available — FFmpeg may not have started")

    print(f"[stream-agent] {req.container_name} is ready — HLS stream live", flush=True)
    return {"ok": True}


@app.post("/containers/{name}/rtmp/start")
async def rtmp_start(name: str, _=Depends(require_auth)):
    _ensure_docker_available()
    proc = await asyncio.create_subprocess_exec(
        "docker", "exec", name, "/scripts/start-rtmp.sh",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=stderr.decode().strip())
    return {"ok": True}


@app.post("/containers/{name}/rtmp/stop")
async def rtmp_stop(name: str, _=Depends(require_auth)):
    _ensure_docker_available()
    proc = await asyncio.create_subprocess_exec(
        "docker", "exec", name, "/scripts/stop-rtmp.sh",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail=stderr.decode().strip())
    return {"ok": True}


@app.delete("/containers/{name}")
async def delete_container(name: str, _=Depends(require_auth)):
    _ensure_docker_available()
    await _stop_container(name)
    return {"ok": True}


async def _stop_container(name: str) -> None:
    try:
        _ensure_docker_available()
        proc = await asyncio.create_subprocess_exec(
            "docker", "stop", "-t", "5", name,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
    except Exception:
        pass


async def _wait_for_port(host: str, port: int, timeout: int = 120) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            reader, writer = await asyncio.open_connection(host, port)
            writer.close()
            await writer.wait_closed()
            return True
        except Exception:
            await asyncio.sleep(2)
    return False


async def _wait_for_hls_manifest(container_name: str, timeout: int = HLS_READY_TIMEOUT_SECONDS) -> bool:
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        proc = await asyncio.create_subprocess_exec(
            "docker", "exec", container_name, "test", "-f", "/tmp/hls/stream.m3u8",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode == 0:
            print(f"[stream-agent] HLS manifest found in {container_name}", flush=True)
            return True
        await asyncio.sleep(3)
    return False


def _ensure_docker_available() -> None:
    if not shutil.which("docker"):
        raise HTTPException(status_code=500, detail="Docker CLI not found in stream-agent container")
    if not os.path.exists("/var/run/docker.sock"):
        raise HTTPException(status_code=500, detail="Docker socket /var/run/docker.sock is not mounted")
