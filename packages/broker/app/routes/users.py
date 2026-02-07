from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db
from ..models import User, Session, Save
from ..schemas import UserSave

router = APIRouter()


@router.get("/api/users/{username}/saves", response_model=List[UserSave])
async def get_user_saves(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """Get all saves for a specific user."""
    username = username.lower()

    user = await db.scalar(
        select(User.username).where(User.username == username)
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    result = await db.execute(
        select(Save)
        .where(Save.username == username)
        .order_by(Save.last_played.desc())
    )
    rows = result.scalars().all()

    return [
        UserSave(
            save_name=row.save_name,
            created_at=row.created_at,
            last_played=row.last_played,
            score_at_save=row.score_at_save,
            playtime_hours=row.playtime_seconds / 3600,
        )
        for row in rows
    ]


@router.get("/api/users/{username}")
async def get_user(
    username: str,
    db: AsyncSession = Depends(get_db),
):
    """Get user profile and stats."""
    username = username.lower()

    result = await db.execute(
        select(
            User.username,
            User.created_at,
            User.best_score,
            User.total_playtime_seconds,
            func.count(Session.session_id).label("total_sessions"),
            func.max(Session.started_at).label("last_session"),
        )
        .outerjoin(Session, Session.username == User.username)
        .where(User.username == username)
        .group_by(User.username, User.created_at, User.best_score, User.total_playtime_seconds)
    )
    row = result.mappings().one_or_none()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")

    rank = await db.scalar(
        select(func.count() + 1).select_from(User).where(User.best_score > row["best_score"])
    )

    return {
        "username": row["username"],
        "created_at": row["created_at"],
        "best_score": row["best_score"],
        "total_playtime_hours": row["total_playtime_seconds"] / 3600,
        "total_sessions": row["total_sessions"],
        "last_session": row["last_session"],
        "rank": rank if row["best_score"] > 0 else None,
    }
