from typing import AsyncGenerator

from fastapi import Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .config import config
from .db import async_session_factory
from .state import AppState


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        yield session


def get_app_state(request: Request) -> AppState:
    return request.app.state.app_state


async def require_admin_key(authorization: str = Header(...)):
    if config.BROKER_ADMIN_KEY and authorization != f"Bearer {config.BROKER_ADMIN_KEY}":
        raise HTTPException(401, "Invalid admin key")


async def require_worker_key(authorization: str = Header(...)):
    if config.RUN_WORKER_API_KEY and authorization != f"Bearer {config.RUN_WORKER_API_KEY}":
        raise HTTPException(401, "Invalid worker key")
