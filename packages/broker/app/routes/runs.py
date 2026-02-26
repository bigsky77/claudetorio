import asyncio
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import config
from ..db import async_session_factory
from ..dependencies import get_db, get_app_state, require_admin_key
from ..models import Run, RunStep
from ..schemas import CreateRunRequest, CreateRunResponse, RunInfo, RunStepInfo
from ..services.factorio import spawn_factorio, stop_factorio, wait_for_factorio, get_map_seed
from ..services.replay import (
    allocate_replay_slot,
    spawn_replay_factorio,
    wait_for_replay_factorio,
    spawn_replay_stream_client,
    wait_for_replay_stream_client,
    spawn_stream_worker_container,
    stop_replay_containers,
)
from ..services.slots import claim_any_free_slot, release_slot_lock
from ..services.vtuber_streaming import (
    spawn_vtuber_stream_client,
    wait_for_vtuber_stream_client,
    stop_vtuber_stream_client,
)
from ..state import AppState

router = APIRouter()


def _normalize_openai_compatible_base_url(url: str) -> str:
    """Accept either a base URL or a pasted endpoint URL like /chat/completions."""
    normalized = url.strip().rstrip("/")
    for suffix in ("/chat/completions", "/v1/chat/completions", "/responses", "/v1/responses"):
        if normalized.endswith(suffix):
            normalized = normalized[: -len(suffix)].rstrip("/")
            break
    return normalized


async def _monitor_run(run_id: str, proc: asyncio.subprocess.Process, app_state: AppState):
    """Monitor a run subprocess and update DB when it exits."""
    stdout_bytes, _ = await proc.communicate()
    app_state.run_processes.pop(run_id, None)
    async with async_session_factory() as db:
        run = await db.scalar(select(Run).where(Run.run_id == run_id))
        if run and run.status == "running":
            run.status = "completed" if proc.returncode == 0 else "failed"
            run.ended_at = datetime.utcnow()
            if proc.returncode != 0:
                output = ""
                if stdout_bytes:
                    full = stdout_bytes.decode(errors="replace")
                    if len(full) > 2000:
                        output = full[:800] + "\n...\n" + full[-800:]
                    else:
                        output = full
                run.error = f"Process exited with code {proc.returncode}\n{output}".strip()
            await db.commit()
        # Safety net: release slot lock if worker didn't
        if run and run.slot is not None:
            await release_slot_lock(run.slot, app_state.redis)
            await stop_factorio(run.slot)


async def _monitor_replay(run_id: str, proc: asyncio.subprocess.Process, app_state: AppState):
    """Monitor a replay subprocess and clean up when it exits."""
    stdout_bytes, _ = await proc.communicate()
    output = stdout_bytes.decode(errors="replace").strip() if stdout_bytes else ""
    print(f"[replay] stream-worker-{run_id} exited (code {proc.returncode})", flush=True)
    if output:
        print(f"[replay] stream-worker-{run_id} output:\n{output}", flush=True)
    replay = app_state.active_replays.pop(run_id, None)
    slot = replay["slot"] if replay else None
    await stop_replay_containers(run_id, slot)


async def _start_run_worker(run: Run, env_vars: dict, app_state: AppState):
    """Start run-worker container and register monitor task."""
    run.status = "running"
    run.started_at = datetime.utcnow()

    broker_url = env_vars["BROKER_URL"]

    # Debug: log env vars being passed (redact secrets)
    safe_keys = {k: (v[:4] + "..." if "KEY" in k or "PASSWORD" in k else v) for k, v in env_vars.items()}
    print(f"[run {run.run_id}] start-worker env_vars: {safe_keys}", flush=True)

    cmd = ["docker", "run", "--platform", "linux/amd64", "--rm", "--name", f"run-worker-{run.run_id}"]
    if config.DOCKER_NETWORK:
        cmd += ["--network", config.DOCKER_NETWORK]
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]
    cmd += [
        config.RUN_WORKER_IMAGE,
        "uv", "run", "python", "main.py",
        "--steps", str(run.max_steps),
        "--broker-url", broker_url,
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    app_state.run_processes[run.run_id] = proc
    asyncio.create_task(_monitor_run(run.run_id, proc, app_state))


@router.get("/api/runs")
async def list_runs(
    status: str = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    query = select(Run).order_by(Run.created_at.desc()).limit(limit)
    if status:
        query = query.where(Run.status == status)
    result = await db.execute(query)
    runs = result.scalars().all()

    # Get step counts
    run_ids = [r.run_id for r in runs]
    step_counts = {}
    if run_ids:
        count_result = await db.execute(
            select(RunStep.run_id, func.count(RunStep.id))
            .where(RunStep.run_id.in_(run_ids))
            .group_by(RunStep.run_id)
        )
        step_counts = dict(count_result.all())

    return [
        RunInfo(
            run_id=r.run_id,
            status=r.status,
            created_at=r.created_at,
            started_at=r.started_at,
            ended_at=r.ended_at,
            slot=r.slot,
            task_key=r.task_key,
            model=r.model,
            max_steps=r.max_steps,
            step_timeout_seconds=r.step_timeout_seconds,
            error=r.error,
            final_score=r.final_score,
            step_count=step_counts.get(r.run_id, 0),
            stream_url=app_state.active_replays[r.run_id]["stream_url"] if r.run_id in app_state.active_replays else None,
            replay_worker_running=(
                bool(app_state.active_replays[r.run_id].get("proc"))
                and app_state.active_replays[r.run_id]["proc"].returncode is None
            ) if r.run_id in app_state.active_replays else None,
            rtmp_active=app_state.active_replays[r.run_id].get("rtmp_active") if r.run_id in app_state.active_replays else None,
            stream_host=None,
            stream_port=None,
            stream_scheme=None,
        )
        for r in runs
    ]


@router.get("/api/runs/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db), app_state: AppState = Depends(get_app_state)):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")

    step_count_result = await db.execute(
        select(func.count(RunStep.id)).where(RunStep.run_id == run_id)
    )
    step_count = step_count_result.scalar() or 0

    replay = app_state.active_replays.get(run_id)

    return RunInfo(
        run_id=run.run_id,
        status=run.status,
        created_at=run.created_at,
        started_at=run.started_at,
        ended_at=run.ended_at,
        slot=run.slot,
        task_key=run.task_key,
        model=run.model,
        max_steps=run.max_steps,
        step_timeout_seconds=run.step_timeout_seconds,
        error=run.error,
        final_score=run.final_score,
        step_count=step_count,
        stream_url=replay["stream_url"] if replay else None,
        replay_worker_running=(bool(replay.get("proc")) and replay["proc"].returncode is None) if replay else None,
        rtmp_active=replay.get("rtmp_active") if replay else None,
        stream_host=None,
        stream_port=None,
        stream_scheme=None,
    )


@router.get("/api/runs/{run_id}/steps")
async def list_run_steps(
    run_id: str,
    limit: int = Query(50, ge=1, le=500),
    after_step_idx: int = Query(-1),
    db: AsyncSession = Depends(get_db),
):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")

    result = await db.execute(
        select(RunStep)
        .where(RunStep.run_id == run_id, RunStep.step_idx > after_step_idx)
        .order_by(RunStep.step_idx)
        .limit(limit)
    )
    steps = result.scalars().all()
    return [
        RunStepInfo(
            id=s.id,
            run_id=s.run_id,
            step_idx=s.step_idx,
            created_at=s.created_at,
            code=s.code,
            result=s.result,
            error_occurred=s.error_occurred,
            reward=s.reward,
            production_score=s.production_score,
            ticks=s.ticks,
            token_usage=s.token_usage,
            achievements=s.achievements,
            observation_summary=s.observation_summary,
        )
        for s in steps
    ]


@router.post("/api/runs", dependencies=[Depends(require_admin_key)])
async def create_run(
    req: CreateRunRequest,
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    if req.provider == "custom" and not req.custom_api_url:
        raise HTTPException(400, "custom_api_url is required when provider=custom")

    run_id = uuid.uuid4().hex[:12]
    username = f"run_{run_id}"

    # Claim the first lockable free slot (skips stale/contended locks)
    slot = await claim_any_free_slot(db, username, app_state.redis)
    if slot is None:
        raise HTTPException(503, "No available slots")

    # Create DB row
    run = Run(
        run_id=run_id,
        status="waiting",
        slot=slot,
        task_key=req.task_key,
        model=req.model,
        max_steps=req.max_steps,
        step_timeout_seconds=req.step_timeout_seconds,
    )
    db.add(run)
    await db.commit()

    if not config.FACTORIO_IMAGE:
        await release_slot_lock(slot, app_state.redis)
        run.status = "failed"
        run.error = "Broker misconfigured: FACTORIO_IMAGE is not set"
        run.ended_at = datetime.utcnow()
        await db.commit()
        raise HTTPException(503, "Broker misconfigured: FACTORIO_IMAGE is not set")

    # Spawn Factorio server for this slot
    await spawn_factorio(slot)
    ready = await wait_for_factorio(slot)
    if not ready:
        await stop_factorio(slot)
        await release_slot_lock(slot, app_state.redis)
        run.status = "failed"
        run.error = "Factorio server failed to start"
        run.ended_at = datetime.utcnow()
        await db.commit()
        raise HTTPException(503, "Factorio server failed to start")

    # Fetch and store the map seed so replays can regenerate the same map
    seed = await get_map_seed(slot)
    if seed is not None:
        run.map_seed = seed
        await db.commit()

    factorio_host = f"factorio-{slot}"

    # Build run-worker env vars and start the run-worker automatically.
    broker_url = "http://broker:8080"
    rcon_port = config.BASE_RCON_PORT
    env_vars = {
        "BROKER_URL": broker_url,
        "MODEL": req.model,
        "SERVER_HOST": factorio_host,
        "RCON_PASSWORD": config.RCON_PASSWORD,
        "RCON_PORT": str(rcon_port),
        "RUN_WORKER_API_KEY": config.RUN_WORKER_API_KEY,
        "RUN_ID": run_id,
        "FLE_RCON_HOST": factorio_host,
        "FLE_RCON_PORT": str(rcon_port),
        "FLE_RCON_PASSWORD": config.RCON_PASSWORD,
    }
    if req.provider == "custom":
        env_vars["FORCE_LLM_PROVIDER"] = "custom"
        env_vars["CUSTOM_API"] = "true"
        env_vars["CUSTOM_API_URL"] = _normalize_openai_compatible_base_url(req.custom_api_url)
        if req.custom_api_key:
            env_vars["CUSTOM_API_KEY"] = req.custom_api_key
    elif req.provider == "anthropic":
        env_vars["FORCE_LLM_PROVIDER"] = "anthropic"
        if req.api_key:
            env_vars["ANTHROPIC_API_KEY"] = req.api_key
    elif req.provider == "openai":
        env_vars["FORCE_LLM_PROVIDER"] = "openai"
        if req.api_key:
            env_vars["OPENAI_API_KEY"] = req.api_key
    elif req.custom_api_url:
        # Backward compatibility with older frontend payloads
        env_vars["FORCE_LLM_PROVIDER"] = "custom"
        env_vars["CUSTOM_API"] = "true"
        env_vars["CUSTOM_API_URL"] = _normalize_openai_compatible_base_url(req.custom_api_url)
        if req.custom_api_key:
            env_vars["CUSTOM_API_KEY"] = req.custom_api_key
    elif req.api_key:
        # Legacy behavior: let model-based detection pick provider, but expose both env vars.
        env_vars["ANTHROPIC_API_KEY"] = req.api_key
        env_vars["OPENAI_API_KEY"] = req.api_key

    try:
        await _start_run_worker(run, env_vars, app_state)
        await db.commit()
    except Exception as e:
        await stop_factorio(slot)
        await release_slot_lock(slot, app_state.redis)
        run.status = "failed"
        run.error = f"Failed to start run-worker: {e}"
        run.ended_at = datetime.utcnow()
        await db.commit()
        raise HTTPException(503, "Failed to start run-worker")

    return CreateRunResponse(run_id=run_id, status="running")


@router.post("/api/runs/{run_id}/start-worker", dependencies=[Depends(require_admin_key)])
async def start_worker(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status != "waiting":
        raise HTTPException(409, f"Run is not waiting (status={run.status})")

    env_vars = app_state.pending_run_envs.pop(run_id, None)
    if not env_vars:
        raise HTTPException(409, "No pending environment for this run (broker may have restarted)")

    await _start_run_worker(run, env_vars, app_state)
    await db.commit()

    return {"run_id": run_id, "status": "running"}


@router.post("/api/runs/{run_id}/stop", dependencies=[Depends(require_admin_key)])
async def stop_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status not in ("running", "waiting"):
        raise HTTPException(409, f"Run is not running or waiting (status={run.status})")

    run.status = "stopped"
    run.ended_at = datetime.utcnow()
    await db.commit()

    # Clean up pending env vars if worker was never started
    app_state.pending_run_envs.pop(run_id, None)

    # Stop the run-worker Docker container
    proc = app_state.run_processes.get(run_id)
    if proc and proc.returncode is None:
        stop_proc = await asyncio.create_subprocess_exec(
            "docker", "stop", "-t", "10", f"run-worker-{run_id}",
        )
        await stop_proc.wait()
        app_state.run_processes.pop(run_id, None)

    # Safety net: release slot lock
    if run.slot is not None:
        await release_slot_lock(run.slot, app_state.redis)
        await stop_factorio(run.slot)

    return {"run_id": run_id, "status": "stopped"}


@router.post("/api/runs/{run_id}/replay", dependencies=[Depends(require_admin_key)])
async def start_replay(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")

    # Check the run has at least one step
    step_count_result = await db.execute(
        select(func.count(RunStep.id)).where(RunStep.run_id == run_id)
    )
    step_count = step_count_result.scalar() or 0
    if step_count == 0:
        raise HTTPException(409, "Run has no steps to replay")

    # Prevent duplicate replays
    if run_id in app_state.active_replays:
        raise HTTPException(409, "Replay already active for this run")

    slot = allocate_replay_slot(app_state.active_replays)
    if slot is None:
        raise HTTPException(503, "No replay slots available (max 5 concurrent replays)")

    # Spawn replay Factorio server (use stored map seed for map fidelity)
    ok = await spawn_replay_factorio(run_id, slot, map_seed=run.map_seed)
    if not ok:
        raise HTTPException(503, "Failed to spawn replay Factorio server")

    ready = await wait_for_replay_factorio(run_id, slot)
    if not ready:
        await stop_replay_containers(run_id, slot)
        raise HTTPException(503, "Replay Factorio server failed to become ready")

    # Spawn replay stream client
    stream_ok = await spawn_replay_stream_client(run_id, slot)
    if stream_ok:
        stream_ready = await wait_for_replay_stream_client(run_id, slot)
        if not stream_ready:
            print(f"[replay {run_id}] WARNING: stream client not ready, proceeding anyway", flush=True)

    endpoint = config.get_replay_stream_public_endpoint(slot)
    stream_url = str(endpoint["stream_url"])

    app_state.active_replays[run_id] = {"slot": slot, "stream_url": stream_url, "proc": None}

    return {"run_id": run_id, "stream_url": stream_url}


@router.post("/api/runs/{run_id}/replay/start-worker", dependencies=[Depends(require_admin_key)])
async def start_replay_worker(
    run_id: str,
    app_state: AppState = Depends(get_app_state),
):
    replay = app_state.active_replays.get(run_id)
    if not replay:
        raise HTTPException(404, "No active replay for this run")

    proc = replay.get("proc")
    if proc and proc.returncode is None:
        raise HTTPException(409, "Replay worker already running")

    slot = replay["slot"]
    print(f"[replay {run_id}] Waiting {config.STREAM_CLIENT_SETTLE_TIME}s for stream client to connect...", flush=True)
    await asyncio.sleep(config.STREAM_CLIENT_SETTLE_TIME)

    broker_url = "http://broker:8080"
    proc = await spawn_stream_worker_container(run_id, slot, broker_url)
    replay["proc"] = proc
    asyncio.create_task(_monitor_replay(run_id, proc, app_state))

    return {"run_id": run_id, "status": "running"}


@router.delete("/api/runs/{run_id}/replay", dependencies=[Depends(require_admin_key)])
async def stop_replay(
    run_id: str,
    app_state: AppState = Depends(get_app_state),
):
    if run_id not in app_state.active_replays:
        raise HTTPException(404, "No active replay for this run")

    replay = app_state.active_replays.pop(run_id, None)
    slot = replay["slot"] if replay else None
    await stop_replay_containers(run_id, slot)

    return {"run_id": run_id, "status": "stopped"}


@router.post("/api/runs/{run_id}/replay/rtmp/start", dependencies=[Depends(require_admin_key)])
async def start_replay_rtmp(
    run_id: str,
    app_state: AppState = Depends(get_app_state),
):
    replay = app_state.active_replays.get(run_id)
    if not replay:
        raise HTTPException(404, "No active replay for this run")
    slot = replay["slot"]

    # Factorio stream URL visible inside Docker network (internal)
    factorio_stream_url = f"http://stream-client-replay-{slot}:3000/stream.m3u8"

    ok = await spawn_vtuber_stream_client(run_id, slot, factorio_stream_url)
    if not ok:
        raise HTTPException(500, "Failed to spawn VTuber stream client")
    await wait_for_vtuber_stream_client(run_id)

    app_state.active_replays[run_id]["rtmp_active"] = True
    return {"ok": True}


@router.post("/api/runs/{run_id}/replay/rtmp/stop", dependencies=[Depends(require_admin_key)])
async def stop_replay_rtmp(
    run_id: str,
    app_state: AppState = Depends(get_app_state),
):
    replay = app_state.active_replays.get(run_id)
    if not replay:
        raise HTTPException(404, "No active replay for this run")

    await stop_vtuber_stream_client(run_id)
    app_state.active_replays[run_id].pop("rtmp_active", None)
    return {"ok": True}
