import json
import tempfile
import uuid
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from ..config import config
from ..dependencies import get_db, get_app_state
from ..models import Session, User, Save, SessionSnapshot
from ..schemas import ClaimRequest, ClaimResponse, ReleaseRequest, SessionInfo
from ..services.rcon import (
    get_slot_score, reset_slot, load_save_to_slot, save_slot_state,
    _sync_get_detailed_score, _sync_get_inventory, _sync_get_research,
    _sync_get_production, _sync_get_factory_data, _sync_get_entities_list,
)
from ..services.factorio import spawn_factorio, stop_factorio, wait_for_factorio
from ..services.slots import get_free_slot, claim_slot_lock, release_slot_lock
from ..services.streaming import spawn_stream_client, stop_stream_client
from ..state import AppState

router = APIRouter()


@router.post("/api/session/claim", response_model=ClaimResponse)
async def claim_session(
    request: ClaimRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    """
    Claim a session slot for a user.

    - Creates user if doesn't exist
    - Assigns an available slot
    - Optionally loads a previous save
    - Returns connection info for Claude Code MCP and Factorio client
    """
    username = request.username.lower().strip()

    # Check if user already has active session
    existing = await db.scalar(
        select(Session).where(Session.username == username, Session.status == "active")
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"User '{username}' already has active session {existing.session_id} on slot {existing.slot}",
        )

    # Find and claim a free slot
    slot = await get_free_slot(db)
    if slot is None:
        raise HTTPException(
            status_code=503,
            detail="No slots available. Try again later or wait for a session to end.",
        )

    if not await claim_slot_lock(slot, username, app_state.redis):
        raise HTTPException(
            status_code=503,
            detail="Slot was claimed by another user. Please try again.",
        )

    try:
        if not config.FACTORIO_IMAGE:
            await release_slot_lock(slot, app_state.redis)
            raise HTTPException(503, "Broker misconfigured: FACTORIO_IMAGE is not set")

        # Spawn Factorio server for this slot
        await spawn_factorio(slot)
        ready = await wait_for_factorio(slot)
        if not ready:
            await stop_factorio(slot)
            await release_slot_lock(slot, app_state.redis)
            raise HTTPException(503, "Factorio server failed to start")

        # Ensure user exists
        stmt = pg_insert(User).values(username=username).on_conflict_do_nothing()
        await db.execute(stmt)

        # Create session
        session_id = str(uuid.uuid4())[:8]
        new_session = Session(
            session_id=session_id,
            username=username,
            slot=slot,
            status="active",
            save_loaded=request.save_name,
        )
        db.add(new_session)
        await db.commit()

        # Load save or reset slot
        if request.save_name:
            save_path = config.SAVES_DIR / username / f"{request.save_name}.zip"
            if save_path.exists():
                background_tasks.add_task(load_save_to_slot, slot, save_path)
            else:
                await db.delete(new_session)
                await db.commit()
                await release_slot_lock(slot, app_state.redis)
                raise HTTPException(
                    status_code=404,
                    detail=f"Save '{request.save_name}' not found",
                )
        else:
            background_tasks.add_task(reset_slot, slot)

        # Spawn stream-client for this slot (no-op if streaming not configured)
        await spawn_stream_client(slot)

        factorio_host = f"factorio-{slot}"
        rcon_port = config.BASE_RCON_PORT
        udp_port = config.get_udp_port(slot)
        stream_endpoint = config.get_stream_public_endpoint(slot)
        expires_at = datetime.utcnow() + timedelta(hours=config.SESSION_TIMEOUT_HOURS)

        mcp_config = {
            "mcpServers": {
                "factorio-fle": {
                    "command": "python",
                    "args": ["-m", "fle.env.protocols._mcp"],
                    "env": {
                        "FLE_SERVER_HOST": factorio_host,
                        "FLE_RCON_PORT": str(rcon_port),
                        "FLE_RCON_PASSWORD": config.RCON_PASSWORD,
                    },
                }
            }
        }

        return ClaimResponse(
            session_id=session_id,
            username=username,
            slot=slot,
            rcon_port=rcon_port,
            udp_port=udp_port,
            mcp_config=mcp_config,
            spectate_address=f"{factorio_host}:{udp_port}",
            stream_url=str(stream_endpoint["stream_url"]),
            stream_host=str(stream_endpoint["stream_host"]),
            stream_port=int(stream_endpoint["stream_port"]),
            stream_scheme=str(stream_endpoint["stream_scheme"]),
            expires_at=expires_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        await release_slot_lock(slot, app_state.redis)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/session/{session_id}/release")
async def release_session(
    session_id: str,
    request: ReleaseRequest,
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    """
    Release a session, optionally saving the game state.

    - Saves game if save_name provided
    - Updates user's best score
    - Frees the slot for other users
    """
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id, Session.status == "active")
    )
    if not session:
        raise HTTPException(
            status_code=404,
            detail="Session not found or already ended",
        )

    slot = session.slot
    username = session.username
    started_at = session.started_at

    # Get final score
    score_data = await get_slot_score(slot)
    final_score = score_data.get("score", 0)

    # Calculate playtime
    playtime_seconds = int((datetime.utcnow() - started_at.replace(tzinfo=None)).total_seconds())

    # Capture game state snapshot before releasing
    try:
        research_data = _sync_get_research(slot)
        production_data = _sync_get_production(slot)
        inventory_data = _sync_get_inventory(slot)
        factory_data = _sync_get_factory_data(slot)

        stmt = pg_insert(SessionSnapshot).values(
            session_id=session_id,
            final_score=final_score,
            playtime_seconds=playtime_seconds,
            research_data=research_data,
            production_data=production_data,
            inventory_data=inventory_data,
            factory_data=factory_data,
        ).on_conflict_do_update(
            index_elements=["session_id"],
            set_={
                "final_score": final_score,
                "playtime_seconds": playtime_seconds,
                "research_data": research_data,
                "production_data": production_data,
                "inventory_data": inventory_data,
                "factory_data": factory_data,
            },
        )
        await db.execute(stmt)
        print(f"Saved snapshot for session {session_id}")
    except Exception as e:
        print(f"Warning: Failed to capture snapshot for session {session_id}: {e}")

    # Save if requested
    if request.save_name:
        save_path = config.SAVES_DIR / username / f"{request.save_name}.zip"
        await save_slot_state(slot, save_path)

        stmt = pg_insert(Save).values(
            username=username,
            save_name=request.save_name,
            file_path=str(save_path),
            score_at_save=final_score,
            playtime_seconds=playtime_seconds,
        ).on_conflict_do_update(
            index_elements=["username", "save_name"],
            set_={
                "last_played": datetime.utcnow(),
                "score_at_save": final_score,
                "playtime_seconds": Save.playtime_seconds + playtime_seconds,
            },
        )
        await db.execute(stmt)

    # Update session
    session.status = "completed"
    session.ended_at = datetime.utcnow()
    session.final_score = final_score
    session.save_created = request.save_name

    # Update user stats
    user = await db.scalar(select(User).where(User.username == username))
    if user:
        user.best_score = max(user.best_score, final_score)
        user.total_playtime_seconds = user.total_playtime_seconds + playtime_seconds

    await db.commit()

    # Release slot
    await release_slot_lock(slot, app_state.redis)
    await stop_stream_client(slot)
    await stop_factorio(slot)

    # Clean up websockets
    if session_id in app_state.active_websockets:
        del app_state.active_websockets[session_id]

    return {
        "status": "released",
        "final_score": final_score,
        "playtime_minutes": playtime_seconds // 60,
        "saved_as": request.save_name,
    }


@router.get("/api/session/{session_id}", response_model=SessionInfo)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get details about a specific session."""
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    current_score = 0.0
    if session.status == "active":
        score_data = await get_slot_score(session.slot)
        current_score = score_data.get("score", 0)
    else:
        current_score = session.final_score or 0.0

    return SessionInfo(
        session_id=session.session_id,
        username=session.username,
        slot=session.slot,
        started_at=session.started_at,
        expires_at=session.started_at + timedelta(hours=config.SESSION_TIMEOUT_HOURS),
        current_score=current_score,
        status=session.status,
    )


@router.get("/api/session/{session_id}/score")
async def get_session_score(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed score breakdown for a session."""
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "active":
        score_data = _sync_get_detailed_score(session.slot)
        playtime_seconds = int((datetime.utcnow() - session.started_at.replace(tzinfo=None)).total_seconds())
    else:
        score_data = {"score": session.final_score or 0}
        playtime_seconds = 0

    return {
        "session_id": session_id,
        "username": session.username,
        "status": session.status,
        "score": score_data.get("score", 0),
        "playtime_seconds": playtime_seconds,
        "playtime_formatted": f"{playtime_seconds // 3600}h {(playtime_seconds % 3600) // 60}m",
    }


@router.get("/api/session/{session_id}/download")
async def download_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Download the current game state as a save file."""
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active - cannot download")

    slot = session.slot
    username = session.username
    temp_dir = Path(tempfile.mkdtemp())
    save_path = temp_dir / f"{username}_{session_id}.zip"

    try:
        await save_slot_state(slot, save_path)
        return FileResponse(
            path=save_path,
            filename=f"{username}_{session_id}.zip",
            media_type="application/zip",
        )
    except Exception as e:
        print(f"Download error for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create save file")


@router.get("/api/session/{session_id}/inventory")
async def get_session_inventory(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get player inventory for a session (live or from snapshot)."""
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "active":
        return _sync_get_inventory(session.slot)
    else:
        snapshot = await db.scalar(
            select(SessionSnapshot).where(SessionSnapshot.session_id == session_id)
        )
        if snapshot and snapshot.inventory_data:
            return snapshot.inventory_data
        return {"items": {}, "total": 0, "note": "No snapshot available"}


@router.get("/api/session/{session_id}/research")
async def get_session_research(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get research progress for a session (live or from snapshot)."""
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "active":
        return _sync_get_research(session.slot)
    else:
        snapshot = await db.scalar(
            select(SessionSnapshot).where(SessionSnapshot.session_id == session_id)
        )
        if snapshot and snapshot.research_data:
            return snapshot.research_data
        return {"current_research": None, "progress": 0, "researched": [], "note": "No snapshot available"}


@router.get("/api/session/{session_id}/production")
async def get_session_production(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get production statistics for a session (live or from snapshot)."""
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "active":
        return _sync_get_production(session.slot)
    else:
        snapshot = await db.scalar(
            select(SessionSnapshot).where(SessionSnapshot.session_id == session_id)
        )
        if snapshot and snapshot.production_data:
            return snapshot.production_data
        return {"produced": {}, "consumed": {}, "net": {}, "note": "No snapshot available"}


@router.get("/api/session/{session_id}/factory")
async def get_session_factory(
    session_id: str,
    radius: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Get factory entity data for a session (live or from snapshot)."""
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status == "active":
        return _sync_get_factory_data(session.slot, radius)
    else:
        snapshot = await db.scalar(
            select(SessionSnapshot).where(SessionSnapshot.session_id == session_id)
        )
        if snapshot and snapshot.factory_data:
            return snapshot.factory_data
        return {"total_entities": 0, "entity_counts": {}, "note": "No snapshot available"}


@router.get("/api/session/{session_id}/entities")
async def get_session_entities(
    session_id: str,
    radius: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Get detailed entity list for a session (live only - too large to store)."""
    session = await db.scalar(
        select(Session).where(Session.session_id == session_id)
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "active":
        return {"entities": [], "total": 0, "note": "Entity list only available for active sessions"}

    return _sync_get_entities_list(session.slot, radius)


@router.websocket("/api/session/{session_id}/stream")
async def session_stream(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time score updates."""
    await websocket.accept()

    app_state: AppState = websocket.app.state.app_state

    # Verify session exists and is active using a fresh DB session
    from ..db import async_session_factory
    async with async_session_factory() as db:
        session = await db.scalar(
            select(Session).where(Session.session_id == session_id)
        )
        if not session or session.status != "active":
            await websocket.close(code=4004, reason="Session not found or inactive")
            return

    # Add to active websockets
    if session_id not in app_state.active_websockets:
        app_state.active_websockets[session_id] = []
    app_state.active_websockets[session_id].append(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if session_id in app_state.active_websockets:
            app_state.active_websockets[session_id].remove(websocket)
