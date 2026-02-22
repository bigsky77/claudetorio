from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db, get_app_state
from ..models import Run, RunStep
from ..schemas import StreamInfo
from ..state import AppState

router = APIRouter()


@router.get("/api/streams", response_model=list[StreamInfo])
async def list_streams(
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    """List all runs that have an active replay stream, plus completed runs available for replay.

    Returns streams sorted by most recently created first.
    """
    # Fetch completed runs with at least one step
    result = await db.execute(
        select(Run)
        .where(Run.status.in_(["completed", "failed", "stopped"]))
        .order_by(Run.created_at.desc())
        .limit(50)
    )
    runs = result.scalars().all()

    # Get step counts in bulk
    run_ids = [r.run_id for r in runs]
    step_counts: dict[str, int] = {}
    if run_ids:
        count_result = await db.execute(
            select(RunStep.run_id, func.count(RunStep.id))
            .where(RunStep.run_id.in_(run_ids))
            .group_by(RunStep.run_id)
        )
        step_counts = dict(count_result.all())

    streams: list[StreamInfo] = []
    for r in runs:
        count = step_counts.get(r.run_id, 0)
        if count == 0:
            continue  # No steps — nothing to replay

        replay = app_state.active_replays.get(r.run_id)
        stream_url = replay["stream_url"] if replay else None
        vtuber_stream_url = replay.get("vtuber_stream_url") if replay else None
        stream_type = "replay" if replay else "available"

        # Human-readable label: model shortname + date
        model_short = r.model.split("/")[-1] if "/" in r.model else r.model
        label = f"{model_short} – {r.created_at.strftime('%Y-%m-%d') if r.created_at else 'unknown'}"
        if replay:
            label += " – LIVE REPLAY"

        streams.append(
            StreamInfo(
                run_id=r.run_id,
                type=stream_type,
                label=label,
                stream_url=stream_url,
                vtuber_stream_url=vtuber_stream_url,
                status=r.status,
                model=r.model,
                step_count=count,
                final_score=r.final_score,
            )
        )

    return streams
