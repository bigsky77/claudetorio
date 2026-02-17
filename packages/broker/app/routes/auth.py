import re
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..dependencies import get_db
from ..models import User

router = APIRouter()


# -- Request / Response schemas --

class OAuthRegisterRequest(BaseModel):
    oauth_provider: str
    oauth_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class UserProfile(BaseModel):
    username: str
    email: Optional[str]
    display_name: Optional[str]
    avatar_url: Optional[str]
    oauth_provider: Optional[str]
    best_score: float
    total_playtime_seconds: int


# -- Helpers --

def _to_profile(user: User) -> UserProfile:
    return UserProfile(
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        oauth_provider=user.oauth_provider,
        best_score=user.best_score,
        total_playtime_seconds=user.total_playtime_seconds,
    )


def _generate_username(email: Optional[str], display_name: Optional[str], oauth_id: str) -> str:
    """Derive a username candidate from the user's email or display name."""
    if email:
        local = email.split("@")[0]
        clean = re.sub(r"[^a-z0-9_]", "", local.lower())
        if len(clean) >= 2:
            return clean[:20]
    if display_name:
        clean = re.sub(r"[^a-z0-9_]", "", display_name.lower().replace(" ", "_"))
        if len(clean) >= 2:
            return clean[:20]
    return f"user_{oauth_id[:8]}"


async def _ensure_unique_username(base: str, db: AsyncSession) -> str:
    """Append a numeric suffix if the username is already taken."""
    candidate = base
    suffix = 0
    while True:
        existing = await db.scalar(select(User.username).where(User.username == candidate))
        if not existing:
            return candidate
        suffix += 1
        candidate = f"{base[:17]}_{suffix}"


# -- Endpoints --

@router.post("/api/auth/register", response_model=UserProfile)
async def register_or_link_oauth_user(
    req: OAuthRegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a new OAuth user, or return the existing one if already linked."""

    # 1. Check for existing user with this OAuth identity
    existing = await db.scalar(
        select(User).where(
            User.oauth_provider == req.oauth_provider,
            User.oauth_id == req.oauth_id,
        )
    )
    if existing:
        # Update profile fields that may have changed on the provider side
        if req.display_name:
            existing.display_name = req.display_name
        if req.avatar_url:
            existing.avatar_url = req.avatar_url
        if req.email:
            existing.email = req.email
        await db.commit()
        return _to_profile(existing)

    # 2. Try to link by email (connect OAuth to a pre-existing user)
    if req.email:
        by_email = await db.scalar(select(User).where(User.email == req.email))
        if by_email and by_email.oauth_provider is None:
            by_email.oauth_provider = req.oauth_provider
            by_email.oauth_id = req.oauth_id
            by_email.display_name = req.display_name or by_email.display_name
            by_email.avatar_url = req.avatar_url or by_email.avatar_url
            await db.commit()
            return _to_profile(by_email)

    # 3. Create a new user
    base_name = _generate_username(req.email, req.display_name, req.oauth_id)
    username = await _ensure_unique_username(base_name, db)

    new_user = User(
        username=username,
        email=req.email,
        display_name=req.display_name,
        avatar_url=req.avatar_url,
        oauth_provider=req.oauth_provider,
        oauth_id=req.oauth_id,
    )
    db.add(new_user)
    await db.commit()
    return _to_profile(new_user)
