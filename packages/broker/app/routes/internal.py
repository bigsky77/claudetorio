from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db, get_app_state, require_worker_key
from ..models import Run, RunStep
from ..schemas import RunStepCreate, CompleteRunRequest
from ..services.rcon import capture_observation
from ..services.slots import release_slot_lock
from ..state import AppState

router = APIRouter()


@router.post("/api/internal/runs/{run_id}/steps", dependencies=[Depends(require_worker_key)])
async def record_step(
    run_id: str,
    req: RunStepCreate,
    db: AsyncSession = Depends(get_db),
):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")

    # Independently capture game state via RCON (don't trust reporter)
    observation = None
    if run.slot is not None:
        observation = await capture_observation(run.slot)

    step = RunStep(
        run_id=run_id,
        step_idx=req.step_idx,
        code=req.code,
        result=req.result,
        error_occurred=req.error_occurred,
        reward=req.reward,
        production_score=req.production_score,
        ticks=req.ticks,
        token_usage=req.token_usage,
        achievements=req.achievements,
        observation_summary=observation,
    )
    db.add(step)
    await db.commit()
    return {"status": "ok", "step_idx": req.step_idx}


@router.post("/api/internal/runs/{run_id}/complete", dependencies=[Depends(require_worker_key)])
async def complete_run(
    run_id: str,
    req: CompleteRunRequest,
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    run = await db.scalar(select(Run).where(Run.run_id == run_id))
    if not run:
        raise HTTPException(404, "Run not found")

    run.final_score = req.final_score
    # Backfill from steps if worker reported None
    if run.final_score is None:
        from .runs import _compute_final_score
        run.final_score = await _compute_final_score(run_id, db)
    run.status = req.status
    run.error = req.error
    run.ended_at = datetime.utcnow()
    await db.commit()

    # Release slot lock
    if run.slot is not None:
        await release_slot_lock(run.slot, app_state.redis)

    return {"status": run.status, "run_id": run_id}
