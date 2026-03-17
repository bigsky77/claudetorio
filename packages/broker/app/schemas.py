from datetime import datetime
from typing import Optional, List, Literal

from pydantic import BaseModel, Field


class ClaimRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=20, pattern=r'^[a-z0-9_]+$')
    save_name: Optional[str] = None

class ClaimResponse(BaseModel):
    session_id: str
    username: str
    slot: int
    rcon_port: int
    udp_port: int
    mcp_config: dict
    spectate_address: str
    stream_url: str  # URL to watch this game's stream
    stream_host: str
    stream_port: int
    stream_scheme: str
    expires_at: datetime

class ReleaseRequest(BaseModel):
    save_name: Optional[str] = None

class SessionInfo(BaseModel):
    session_id: str
    username: str
    slot: int
    started_at: datetime
    expires_at: datetime
    current_score: float
    status: str

class LeaderboardEntry(BaseModel):
    rank: int
    username: str
    best_score: float
    total_playtime_hours: float
    sessions_played: int
    last_played: Optional[datetime]
    best_session_id: Optional[str] = None

class UserSave(BaseModel):
    save_name: str
    created_at: datetime
    last_played: datetime
    score_at_save: float
    playtime_hours: float

class SystemStatus(BaseModel):
    total_slots: int
    available_slots: int
    active_sessions: List[dict]
    total_users: int
    total_sessions_all_time: int


# --- Run-related schemas ---

class CreateRunRequest(BaseModel):
    provider: Optional[Literal["anthropic", "openai", "custom"]] = None
    task_key: str = "open_play"
    model: str = "claude-sonnet-4-5-20250929"
    max_steps: int = 200
    step_timeout_seconds: int = 60
    enable_streaming: bool = False  # Opt-in: stream-client adds significant resource overhead
    manual: bool = False  # Skip LLM worker; return RCON details for direct access
    # Provider credentials (sent per-run from frontend)
    api_key: Optional[str] = None
    custom_api_url: Optional[str] = None
    custom_api_key: Optional[str] = None

class CreateRunResponse(BaseModel):
    run_id: str
    status: str
    # Only populated for manual runs:
    rcon_host: Optional[str] = None
    rcon_port: Optional[int] = None
    rcon_password: Optional[str] = None

class RunInfo(BaseModel):
    run_id: str
    status: str
    created_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    slot: Optional[int] = None
    task_key: str
    model: str
    max_steps: int
    step_timeout_seconds: int
    error: Optional[str] = None
    final_score: Optional[float] = None
    step_count: int = 0
    stream_url: Optional[str] = None
    replay_worker_running: Optional[bool] = None
    rtmp_active: Optional[bool] = None
    stream_host: Optional[str] = None
    stream_port: Optional[int] = None
    stream_scheme: Optional[str] = None

class RunStepInfo(BaseModel):
    id: int
    run_id: str
    step_idx: int
    created_at: Optional[datetime] = None
    code: str
    result: Optional[str] = None
    error_occurred: bool = False
    reward: Optional[float] = None
    production_score: Optional[float] = None
    ticks: Optional[int] = None
    token_usage: Optional[dict] = None
    achievements: Optional[dict] = None
    observation_summary: Optional[dict] = None

class RunStepCreate(BaseModel):
    step_idx: int
    code: str
    result: Optional[str] = None
    error_occurred: bool = False
    reward: Optional[float] = None
    production_score: Optional[float] = None
    ticks: Optional[int] = None
    token_usage: Optional[dict] = None
    achievements: Optional[dict] = None
    observation_summary: Optional[dict] = None

class CompleteRunRequest(BaseModel):
    final_score: Optional[float] = None
    status: str = "completed"
    error: Optional[str] = None


# --- Chat schemas ---

# --- Auth schemas ---

class GitHubAuthUrlResponse(BaseModel):
    url: str

class GitHubCallbackRequest(BaseModel):
    code: str

class AuthTokenResponse(BaseModel):
    token: str
    user: "AuthUser"

class AuthUser(BaseModel):
    id: int
    github_id: int
    github_username: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None

class AuthMeResponse(BaseModel):
    user: AuthUser


class RunsLeaderboardEntry(BaseModel):
    rank: int
    username: str
    avatar_url: Optional[str] = None
    model: str
    best_score: float
    best_run_id: str
    milestone: Optional[str] = None
    status: str
    run_count: int


class ChatMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)
    username: str = Field(..., min_length=1, max_length=30)

class ChatMessageResponse(BaseModel):
    id: int
    stream_id: str
    username: str
    content: str
    is_ai: bool
    created_at: datetime
