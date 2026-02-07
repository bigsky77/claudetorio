from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import config
from ..dependencies import get_db, get_app_state
from ..models import Session, User
from ..schemas import SystemStatus
from ..state import AppState

router = APIRouter()


@router.get("/api/status", response_model=SystemStatus)
async def get_status(
    db: AsyncSession = Depends(get_db),
):
    """Get overall system status - useful for monitoring and the frontend."""
    result = await db.execute(
        select(Session).where(Session.status == "active")
    )
    active_sessions = result.scalars().all()

    total_users = await db.scalar(select(func.count()).select_from(User))
    total_sessions = await db.scalar(select(func.count()).select_from(Session))

    return SystemStatus(
        total_slots=config.TOTAL_SLOTS,
        available_slots=config.TOTAL_SLOTS - len(active_sessions),
        active_sessions=[
            {
                "session_id": s.session_id,
                "username": s.username,
                "slot": s.slot,
                "started_at": s.started_at.isoformat(),
                "stream_url": config.get_stream_url(s.slot),
            }
            for s in active_sessions
        ],
        total_users=total_users,
        total_sessions_all_time=total_sessions,
    )


@router.get("/health")
async def health_check(
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    """Health check endpoint for monitoring."""
    try:
        await db.scalar(select(1))
        await app_state.redis.ping()
        return {"status": "healthy"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
