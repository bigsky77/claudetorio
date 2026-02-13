import asyncio
import json
from datetime import datetime, timedelta

from sqlalchemy import select

from .config import config
from .db import async_session_factory
from .models import Session, ScoreHistory, User, Save
from .services.factorio import stop_factorio
from .services.rcon import get_slot_score, save_slot_state
from .services.slots import release_slot_lock
from .services.streaming import stop_stream_client
from .state import AppState


async def score_polling_loop(app_state: AppState):
    """Periodically poll active sessions for scores and broadcast updates."""
    while True:
        await asyncio.sleep(config.SCORE_POLL_INTERVAL)
        try:
            async with async_session_factory() as db:
                result = await db.execute(
                    select(Session).where(Session.status == "active")
                )
                active = result.scalars().all()

                for session in active:
                    slot = session.slot
                    session_id = session.session_id
                    username = session.username

                    # Get current score
                    score_data = await get_slot_score(slot)
                    score = score_data.get("score", 0)

                    # Record in history
                    history = ScoreHistory(
                        username=username,
                        session_id=session_id,
                        score=score,
                        items_produced=score_data.get("items", {}),
                    )
                    db.add(history)
                    await db.commit()

                    # Broadcast to websockets
                    if session_id in app_state.active_websockets:
                        message = json.dumps({
                            "type": "score_update",
                            "score": score,
                            "timestamp": datetime.utcnow().isoformat(),
                        })
                        for ws in app_state.active_websockets[session_id]:
                            try:
                                await ws.send_text(message)
                            except:
                                pass

        except Exception as e:
            print(f"Score polling error: {e}")


async def session_timeout_checker(app_state: AppState):
    """Check for and clean up expired sessions."""
    while True:
        await asyncio.sleep(60)
        try:
            cutoff = datetime.utcnow() - timedelta(hours=config.SESSION_TIMEOUT_HOURS)
            async with async_session_factory() as db:
                result = await db.execute(
                    select(Session).where(Session.status == "active", Session.started_at < cutoff)
                )
                expired = result.scalars().all()

                for session in expired:
                    print(f"Expiring session {session.session_id} for {session.username}")

                    # Get final score before expiring
                    score_data = await get_slot_score(session.slot)
                    final_score = score_data.get("score", 0)

                    # Calculate playtime
                    playtime_seconds = int(
                        (datetime.utcnow() - session.started_at.replace(tzinfo=None)).total_seconds()
                    )

                    # Auto-save before expiring
                    save_name = f"autosave_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
                    save_path = config.SAVES_DIR / session.username / f"{save_name}.zip"

                    try:
                        await save_slot_state(session.slot, save_path)

                        from sqlalchemy.dialects.postgresql import insert as pg_insert
                        stmt = pg_insert(Save).values(
                            username=session.username,
                            save_name=save_name,
                            file_path=str(save_path),
                            score_at_save=final_score,
                            playtime_seconds=playtime_seconds,
                        ).on_conflict_do_update(
                            index_elements=["username", "save_name"],
                            set_={
                                "last_played": datetime.utcnow(),
                                "score_at_save": final_score,
                            },
                        )
                        await db.execute(stmt)
                    except Exception as e:
                        print(f"Error auto-saving: {e}")

                    # Mark session as expired with final score
                    session.status = "expired"
                    session.ended_at = datetime.utcnow()
                    session.final_score = final_score

                    # Update user's best score
                    user = await db.scalar(select(User).where(User.username == session.username))
                    if user:
                        user.best_score = max(user.best_score, final_score)
                        user.total_playtime_seconds = user.total_playtime_seconds + playtime_seconds

                    await db.commit()

                    await release_slot_lock(session.slot, app_state.redis)
                    await stop_stream_client(session.slot)
                    await stop_factorio(session.slot)

        except Exception as e:
            print(f"Session timeout checker error: {e}")
