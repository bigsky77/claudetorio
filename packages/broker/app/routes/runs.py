import asyncio
import os
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
from ..services.slots import get_free_slot, claim_slot_lock, release_slot_lock
from ..state import AppState

router = APIRouter()


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


@router.get("/api/runs")
async def list_runs(
    status: str = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
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
        )
        for r in runs
    ]


@router.get("/api/runs/{run_id}")
async def get_run(run_id: str, db: AsyncSession = Depends(get_db)):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")

    step_count_result = await db.execute(
        select(func.count(RunStep.id)).where(RunStep.run_id == run_id)
    )
    step_count = step_count_result.scalar() or 0

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
    # Allocate a slot
    slot = await get_free_slot(db)
    if slot is None:
        raise HTTPException(503, "No available slots")

    run_id = uuid.uuid4().hex[:12]
    username = f"run_{run_id}"

    # Claim Redis lock for the slot
    locked = await claim_slot_lock(slot, username, app_state.redis)
    if not locked:
        raise HTTPException(503, "Slot lock contention, try again")

    # Create DB row
    run = Run(
        run_id=run_id,
        status="running",
        started_at=datetime.utcnow(),
        slot=slot,
        task_key=req.task_key,
        model=req.model,
        max_steps=req.max_steps,
        step_timeout_seconds=req.step_timeout_seconds,
    )
    db.add(run)
    await db.commit()

    # Spawn run-worker Docker container
    broker_url = "http://broker:8080"
    rcon_port = config.BASE_RCON_PORT + slot
    env_vars = {
        "BROKER_URL": broker_url,
        "MODEL": req.model,
        "SERVER_HOST": config.SERVER_HOST,
        "RCON_PASSWORD": config.RCON_PASSWORD,
        "RCON_PORT": str(rcon_port),
        "RUN_WORKER_API_KEY": config.RUN_WORKER_API_KEY,
        "RUN_ID": run_id,
        # FLE reads these at module-import time, so they must be in the
        # container env before any Python import runs.
        "FLE_RCON_HOST": config.SERVER_HOST,
        "FLE_RCON_PORT": str(rcon_port),
        "FLE_RCON_PASSWORD": config.RCON_PASSWORD,
    }
    # User-provided credentials from the request
    if req.custom_api_url:
        env_vars["CUSTOM_API"] = "true"
        env_vars["CUSTOM_API_URL"] = req.custom_api_url
        if req.custom_api_key:
            env_vars["CUSTOM_API_KEY"] = req.custom_api_key
    elif req.api_key:
        env_vars["ANTHROPIC_API_KEY"] = req.api_key
        env_vars["OPENAI_API_KEY"] = req.api_key

    # Debug: log env vars being passed (redact secrets)
    safe_keys = {k: (v[:4] + "..." if "KEY" in k or "PASSWORD" in k else v) for k, v in env_vars.items()}
    print(f"[run {run_id}] env_vars: {safe_keys}", flush=True)

    cmd = ["docker", "run", "--rm", "--name", f"run-worker-{run_id}"]
    if config.DOCKER_NETWORK:
        cmd += ["--network", config.DOCKER_NETWORK]
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]
    cmd += [
        config.RUN_WORKER_IMAGE,
        "uv", "run", "python", "main.py",
        "--steps", str(req.max_steps),
        "--broker-url", broker_url,
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    app_state.run_processes[run_id] = proc
    asyncio.create_task(_monitor_run(run_id, proc, app_state))

    return CreateRunResponse(run_id=run_id, status="running")


@router.post("/api/runs/{run_id}/stop", dependencies=[Depends(require_admin_key)])
async def stop_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")
    if run.status != "running":
        raise HTTPException(409, f"Run is not running (status={run.status})")

    run.status = "stopped"
    run.ended_at = datetime.utcnow()
    await db.commit()

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

    return {"run_id": run_id, "status": "stopped"}
