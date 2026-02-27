from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import config
from ..dependencies import get_db, get_current_user
from ..models import GitHubUser
from ..schemas import (
    GitHubAuthUrlResponse,
    GitHubCallbackRequest,
    AuthTokenResponse,
    AuthUser,
    AuthMeResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_USER_EMAILS_URL = "https://api.github.com/user/emails"


@router.get("/github", response_model=GitHubAuthUrlResponse)
async def github_auth_url():
    if not config.GITHUB_CLIENT_ID:
        raise HTTPException(500, "GitHub OAuth not configured")
    params = {
        "client_id": config.GITHUB_CLIENT_ID,
        "redirect_uri": config.GITHUB_CALLBACK_URL,
        "scope": "user:email read:user",
    }
    return GitHubAuthUrlResponse(url=f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}")


@router.post("/github/callback", response_model=AuthTokenResponse)
async def github_callback(body: GitHubCallbackRequest, db: AsyncSession = Depends(get_db)):
    if not config.GITHUB_CLIENT_ID or not config.GITHUB_CLIENT_SECRET:
        raise HTTPException(500, "GitHub OAuth not configured")

    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            GITHUB_TOKEN_URL,
            json={
                "client_id": config.GITHUB_CLIENT_ID,
                "client_secret": config.GITHUB_CLIENT_SECRET,
                "code": body.code,
                "redirect_uri": config.GITHUB_CALLBACK_URL,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise HTTPException(400, "Failed to exchange code with GitHub")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            error = token_data.get("error_description", "Unknown error")
            raise HTTPException(400, f"GitHub OAuth error: {error}")

        # Fetch user info
        gh_headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}
        user_resp = await client.get(GITHUB_USER_URL, headers=gh_headers)
        if user_resp.status_code != 200:
            raise HTTPException(400, "Failed to fetch GitHub user info")
        user_data = user_resp.json()

        # Fetch primary email if not public
        email = user_data.get("email")
        if not email:
            emails_resp = await client.get(GITHUB_USER_EMAILS_URL, headers=gh_headers)
            if emails_resp.status_code == 200:
                for e in emails_resp.json():
                    if e.get("primary"):
                        email = e.get("email")
                        break

    github_id = user_data["id"]
    github_username = user_data.get("login", "")
    avatar_url = user_data.get("avatar_url", "")

    # Upsert GitHubUser
    result = await db.execute(select(GitHubUser).where(GitHubUser.github_id == github_id))
    gh_user = result.scalar_one_or_none()
    if gh_user:
        gh_user.github_username = github_username
        gh_user.email = email
        gh_user.avatar_url = avatar_url
        gh_user.github_token = access_token
        gh_user.updated_at = datetime.now(timezone.utc)
    else:
        gh_user = GitHubUser(
            github_id=github_id,
            github_username=github_username,
            email=email,
            avatar_url=avatar_url,
            github_token=access_token,
        )
        db.add(gh_user)

    await db.commit()
    await db.refresh(gh_user)

    # Create JWT
    payload = {
        "sub": str(gh_user.id),
        "github_id": gh_user.github_id,
        "github_username": gh_user.github_username,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    token = jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")

    auth_user = AuthUser(
        id=gh_user.id,
        github_id=gh_user.github_id,
        github_username=gh_user.github_username,
        email=gh_user.email,
        avatar_url=gh_user.avatar_url,
    )
    return AuthTokenResponse(token=token, user=auth_user)


@router.get("/me", response_model=AuthMeResponse)
async def auth_me(
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GitHubUser).where(GitHubUser.id == int(current_user["sub"]))
    )
    gh_user = result.scalar_one_or_none()
    if not gh_user:
        raise HTTPException(404, "User not found")
    return AuthMeResponse(
        user=AuthUser(
            id=gh_user.id,
            github_id=gh_user.github_id,
            github_username=gh_user.github_username,
            email=gh_user.email,
            avatar_url=gh_user.avatar_url,
        )
    )
