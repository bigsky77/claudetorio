from typing import AsyncGenerator, Optional

import jwt
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


async def require_admin_key(authorization: Optional[str] = Header(None)):
    if config.BROKER_ADMIN_KEY:
        if not authorization or authorization != f"Bearer {config.BROKER_ADMIN_KEY}":
            raise HTTPException(401, "Invalid admin key")


async def require_worker_key(authorization: Optional[str] = Header(None)):
    if config.RUN_WORKER_API_KEY:
        if not authorization or authorization != f"Bearer {config.RUN_WORKER_API_KEY}":
            raise HTTPException(401, "Invalid worker key")


def _decode_jwt(token: str) -> dict:
    try:
        return jwt.decode(token, config.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


async def get_current_user_optional(
    authorization: Optional[str] = Header(None),
    x_user_token: Optional[str] = Header(None),
) -> Optional[dict]:
    """Decode JWT from X-User-Token (preferred) or Authorization header, or return None if absent."""
    # X-User-Token carries the user JWT when Authorization holds the admin key
    if x_user_token and x_user_token.startswith("Bearer "):
        try:
            return _decode_jwt(x_user_token[7:])
        except HTTPException:
            pass
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return _decode_jwt(authorization[7:])
    except HTTPException:
        return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """Decode JWT from Authorization header, or raise 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authorization header")
    return _decode_jwt(authorization[7:])
