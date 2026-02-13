from typing import Optional

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import config
from ..models import Session, Run


async def get_free_slot(db: AsyncSession) -> Optional[int]:
    """Find first available slot (checks both active sessions and running runs)."""
    session_result = await db.execute(
        select(Session.slot).where(Session.status == "active")
    )
    run_result = await db.execute(
        select(Run.slot).where(Run.status.in_(["running"]))
    )
    occupied = {r[0] for r in session_result.all()} | {r[0] for r in run_result.all() if r[0] is not None}

    for slot in range(config.TOTAL_SLOTS):
        if slot not in occupied:
            return slot
    return None


async def claim_slot_lock(slot: int, username: str, redis_client: redis.Redis) -> bool:
    """Atomically claim a slot using Redis lock."""
    lock_key = f"slot_lock:{slot}"
    acquired = await redis_client.set(
        lock_key,
        username,
        nx=True,
        ex=config.SESSION_TIMEOUT_HOURS * 3600,
    )
    return bool(acquired)


async def release_slot_lock(slot: int, redis_client: redis.Redis):
    """Release a slot lock."""
    lock_key = f"slot_lock:{slot}"
    await redis_client.delete(lock_key)
