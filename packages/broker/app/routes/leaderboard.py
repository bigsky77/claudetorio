from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db
from ..schemas import LeaderboardEntry

router = APIRouter()


@router.get("/api/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Get the top players by best score."""
    result = await db.execute(
        text("""
            SELECT
                u.username,
                u.best_score,
                u.total_playtime_seconds,
                COUNT(s.session_id) as sessions_played,
                MAX(s.started_at) as last_played,
                (SELECT session_id FROM sessions
                 WHERE username = u.username AND final_score = u.best_score
                 ORDER BY ended_at DESC LIMIT 1) as best_session_id
            FROM users u
            LEFT JOIN sessions s ON s.username = u.username
            WHERE u.best_score > 0
            GROUP BY u.username, u.best_score, u.total_playtime_seconds
            ORDER BY u.best_score DESC
            LIMIT :limit
        """),
        {"limit": limit},
    )

    rows = result.mappings().all()
    return [
        LeaderboardEntry(
            rank=i + 1,
            username=row["username"],
            best_score=row["best_score"],
            total_playtime_hours=row["total_playtime_seconds"] / 3600,
            sessions_played=row["sessions_played"],
            last_played=row["last_played"],
            best_session_id=row["best_session_id"],
        )
        for i, row in enumerate(rows)
    ]
