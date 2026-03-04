from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import (
    String, Integer, BigInteger, Float, Boolean, Text, Index,
    ForeignKey, JSON, text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    best_score: Mapped[float] = mapped_column(Float, server_default=text("0"))
    total_playtime_seconds: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    sessions: Mapped[List["Session"]] = relationship(back_populates="user")
    saves: Mapped[List["Save"]] = relationship(back_populates="user")
    score_history: Mapped[List["ScoreHistory"]] = relationship(back_populates="user")


class Session(Base):
    __tablename__ = "sessions"

    session_id: Mapped[str] = mapped_column(String, primary_key=True)
    username: Mapped[str] = mapped_column(ForeignKey("users.username"))
    slot: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    ended_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    final_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, server_default=text("'active'"))
    save_loaded: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    save_created: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    user: Mapped["User"] = relationship(back_populates="sessions")
    snapshot: Mapped[Optional["SessionSnapshot"]] = relationship(back_populates="session")
    score_history: Mapped[List["ScoreHistory"]] = relationship(back_populates="session")

    __table_args__ = (
        Index("idx_sessions_active", "slot", postgresql_where=text("status = 'active'")),
        Index("idx_sessions_username", "username"),
    )


class Save(Base):
    __tablename__ = "saves"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(ForeignKey("users.username"))
    save_name: Mapped[str] = mapped_column(String, nullable=False)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    last_played: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    score_at_save: Mapped[float] = mapped_column(Float, server_default=text("0"))
    playtime_seconds: Mapped[int] = mapped_column(Integer, server_default=text("0"))

    user: Mapped["User"] = relationship(back_populates="saves")

    __table_args__ = (
        # UNIQUE(username, save_name) — matches original schema
        {"implicit_returning": True},
    )

    # Use UniqueConstraint at table level
    from sqlalchemy import UniqueConstraint
    __table_args__ = (
        UniqueConstraint("username", "save_name"),
    )


class ScoreHistory(Base):
    __tablename__ = "score_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(ForeignKey("users.username"))
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.session_id"))
    recorded_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    items_produced: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    user: Mapped["User"] = relationship(back_populates="score_history")
    session: Mapped["Session"] = relationship(back_populates="score_history")

    __table_args__ = (
        Index("idx_score_history_session", "session_id"),
    )


class SessionSnapshot(Base):
    __tablename__ = "session_snapshots"

    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.session_id"), primary_key=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    final_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    playtime_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    research_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    production_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    inventory_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    factory_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    session: Mapped["Session"] = relationship(back_populates="snapshot")


class Run(Base):
    __tablename__ = "runs"

    run_id: Mapped[str] = mapped_column(String, primary_key=True)
    status: Mapped[str] = mapped_column(String, nullable=False, server_default=text("'queued'"))
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    started_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    ended_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    slot: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    task_key: Mapped[str] = mapped_column(String, nullable=False, server_default=text("'open_play'"))
    model: Mapped[str] = mapped_column(String, nullable=False)
    max_steps: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("200"))
    step_timeout_seconds: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("60"))
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    final_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    map_seed: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    github_user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("github_users.id"), nullable=True)

    steps: Mapped[List["RunStep"]] = relationship(back_populates="run")
    github_user: Mapped[Optional["GitHubUser"]] = relationship()

    __table_args__ = (
        Index("idx_runs_status_created", "status", "created_at"),
        Index("idx_runs_active_slot", "slot", postgresql_where=text("status = 'running'")),
    )


class RunStep(Base):
    __tablename__ = "run_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.run_id"), nullable=False)
    step_idx: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    code: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_occurred: Mapped[bool] = mapped_column(Boolean, server_default=text("FALSE"))
    reward: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    production_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ticks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    token_usage: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    achievements: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    observation_summary: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    run: Mapped["Run"] = relationship(back_populates="steps")

    __table_args__ = (
        # UNIQUE(run_id, step_idx)
        {"implicit_returning": True},
    )

    from sqlalchemy import UniqueConstraint
    __table_args__ = (
        UniqueConstraint("run_id", "step_idx"),
        Index("idx_run_steps_run", "run_id"),
    )


class GitHubUser(Base):
    __tablename__ = "github_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    github_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    github_username: Mapped[str] = mapped_column(String, nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    github_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))
    updated_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"), onupdate=lambda: datetime.now(timezone.utc).replace(tzinfo=None))


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    stream_id: Mapped[str] = mapped_column(String, nullable=False)
    username: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_ai: Mapped[bool] = mapped_column(Boolean, server_default=text("FALSE"))
    created_at: Mapped[Optional[datetime]] = mapped_column(server_default=text("NOW()"))

    __table_args__ = (
        Index("idx_chat_messages_stream_id", "stream_id", "id"),
    )
