"""
Claudetorio Session Broker

Manages player sessions, slot allocation, saves, and scoring.
Integrates with FLE cluster via RCON for game control.
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
import asyncpg
import redis.asyncio as redis
import os
import json
import asyncio
import shutil
from pathlib import Path
from dotenv import load_dotenv
from mcrcon import MCRcon

load_dotenv()

# ============== Configuration ==============

class Config:
    TOTAL_SLOTS = 20
    BASE_RCON_PORT = 27000
    BASE_UDP_PORT = 34197
    RCON_PASSWORD = os.getenv("RCON_PASSWORD", "factorio")
    SERVER_HOST = os.getenv("SERVER_HOST", "localhost")
    SAVES_DIR = Path(os.getenv("SAVES_DIR", "/var/claudetorio/saves"))
    FLE_SAVES_DIR = Path(os.getenv("FLE_SAVES_DIR", "/var/claudetorio/fle/saves"))
    SESSION_TIMEOUT_HOURS = 2
    POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
    POSTGRES_DB = os.getenv("POSTGRES_DB", "claudetorio")
    POSTGRES_USER = os.getenv("POSTGRES_USER", "claudetorio")
    POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "claudetorio_secret_123")
    REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
    SCORE_POLL_INTERVAL = 30  # seconds

config = Config()

# ============== Global State ==============

db_pool: asyncpg.Pool = None
redis_client: redis.Redis = None
active_websockets: Dict[str, List[WebSocket]] = {}  # session_id -> websockets


# ============== Models ==============

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


# ============== Database ==============

async def init_db():
    """Initialize database connection pool and create tables."""
    global db_pool, redis_client

    db_pool = await asyncpg.create_pool(
        host=config.POSTGRES_HOST,
        database=config.POSTGRES_DB,
        user=config.POSTGRES_USER,
        password=config.POSTGRES_PASSWORD,
        min_size=5,
        max_size=20,
    )

    redis_client = redis.Redis(
        host=config.REDIS_HOST,
        port=6379,
        decode_responses=True
    )

    async with db_pool.acquire() as conn:
        await conn.execute("""
            -- Users table
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                best_score REAL DEFAULT 0,
                total_playtime_seconds INTEGER DEFAULT 0
            );

            -- Sessions table
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                username TEXT REFERENCES users(username),
                slot INTEGER NOT NULL,
                started_at TIMESTAMPTZ DEFAULT NOW(),
                ended_at TIMESTAMPTZ,
                final_score REAL,
                status TEXT DEFAULT 'active',
                save_loaded TEXT,
                save_created TEXT
            );

            -- Saves table
            CREATE TABLE IF NOT EXISTS saves (
                id SERIAL PRIMARY KEY,
                username TEXT REFERENCES users(username),
                save_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_played TIMESTAMPTZ DEFAULT NOW(),
                score_at_save REAL DEFAULT 0,
                playtime_seconds INTEGER DEFAULT 0,
                UNIQUE(username, save_name)
            );

            -- Score history for tracking progress over time
            CREATE TABLE IF NOT EXISTS score_history (
                id SERIAL PRIMARY KEY,
                username TEXT REFERENCES users(username),
                session_id TEXT REFERENCES sessions(session_id),
                recorded_at TIMESTAMPTZ DEFAULT NOW(),
                score REAL,
                items_produced JSONB
            );

            -- Indexes
            CREATE INDEX IF NOT EXISTS idx_sessions_active
                ON sessions(slot) WHERE status = 'active';
            CREATE INDEX IF NOT EXISTS idx_sessions_username
                ON sessions(username);
            CREATE INDEX IF NOT EXISTS idx_users_score
                ON users(best_score DESC);
            CREATE INDEX IF NOT EXISTS idx_score_history_session
                ON score_history(session_id);
        """)


async def close_db():
    """Close database connections."""
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.close()


# ============== FLE Integration ==============

def get_rcon_connection(slot: int) -> MCRcon:
    """Get RCON connection for a slot."""
    port = config.BASE_RCON_PORT + slot
    return MCRcon("localhost", config.RCON_PASSWORD, port=port)


async def get_slot_score(slot: int) -> dict:
    """
    Query FLE for current production statistics.
    Returns dict with score and production details.
    """
    try:
        # Use RCON to query game state
        # This is a simplified version - actual implementation depends on FLE's Lua API
        with get_rcon_connection(slot) as rcon:
            # FLE should have commands to get production stats
            # Example command (adjust based on FLE's actual API):
            response = rcon.command("/silent-command rcon.print(game.json_encode(game.forces['player'].item_production_statistics.input_counts))")

            # Parse response and calculate score
            # For now, return placeholder
            try:
                data = json.loads(response) if response else {}
                # Calculate science per minute or other metric
                # This needs to be adjusted based on FLE's actual output
                science_items = ['automation-science-pack', 'logistic-science-pack', 'military-science-pack',
                                'chemical-science-pack', 'production-science-pack', 'utility-science-pack']
                total_science = sum(data.get(item, 0) for item in science_items)
                return {
                    "score": total_science,
                    "items": data
                }
            except json.JSONDecodeError:
                return {"score": 0, "items": {}}
    except Exception as e:
        print(f"Error getting score for slot {slot}: {e}")
        return {"score": 0, "items": {}, "error": str(e)}


async def reset_slot(slot: int):
    """Reset a slot to a fresh game state."""
    try:
        with get_rcon_connection(slot) as rcon:
            # FLE command to reset/restart the game
            # Adjust based on FLE's actual API
            rcon.command("/silent-command game.reset_game_state()")
    except Exception as e:
        print(f"Error resetting slot {slot}: {e}")
        raise


async def load_save_to_slot(slot: int, save_path: Path):
    """Load a save file into a specific slot."""
    try:
        # Copy save to FLE's expected location
        fle_save_path = config.FLE_SAVES_DIR / f"slot_{slot}" / "save.zip"
        fle_save_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(save_path, fle_save_path)

        # Tell Factorio to load it
        with get_rcon_connection(slot) as rcon:
            rcon.command(f"/silent-command game.server_save('slot_{slot}')")
            # May need to restart the server or use different command
    except Exception as e:
        print(f"Error loading save to slot {slot}: {e}")
        raise


async def save_slot_state(slot: int, save_path: Path):
    """Save current slot state to a file."""
    try:
        save_path.parent.mkdir(parents=True, exist_ok=True)

        with get_rcon_connection(slot) as rcon:
            # Trigger save
            save_name = f"claudetorio_save_{slot}"
            rcon.command(f"/silent-command game.server_save('{save_name}')")
            await asyncio.sleep(2)  # Wait for save to complete

        # Copy from FLE saves to user saves
        fle_save = config.FLE_SAVES_DIR / f"{save_name}.zip"
        if fle_save.exists():
            shutil.copy2(fle_save, save_path)
        else:
            print(f"Warning: Save file not found at {fle_save}")
    except Exception as e:
        print(f"Error saving slot {slot}: {e}")
        raise


# ============== Slot Management ==============

async def get_free_slot() -> Optional[int]:
    """Find first available slot."""
    async with db_pool.acquire() as conn:
        active_slots = await conn.fetch(
            "SELECT slot FROM sessions WHERE status = 'active'"
        )
        active_set = {row['slot'] for row in active_slots}

        for slot in range(config.TOTAL_SLOTS):
            if slot not in active_set:
                return slot
    return None


async def claim_slot_lock(slot: int, username: str) -> bool:
    """Atomically claim a slot using Redis lock."""
    lock_key = f"slot_lock:{slot}"
    acquired = await redis_client.set(
        lock_key,
        username,
        nx=True,
        ex=config.SESSION_TIMEOUT_HOURS * 3600
    )
    return bool(acquired)


async def release_slot_lock(slot: int):
    """Release a slot lock."""
    lock_key = f"slot_lock:{slot}"
    await redis_client.delete(lock_key)


# ============== Background Tasks ==============

async def score_polling_loop():
    """Periodically poll active sessions for scores and broadcast updates."""
    while True:
        await asyncio.sleep(config.SCORE_POLL_INTERVAL)
        try:
            async with db_pool.acquire() as conn:
                active = await conn.fetch(
                    "SELECT session_id, username, slot FROM sessions WHERE status = 'active'"
                )

                for session in active:
                    slot = session['slot']
                    session_id = session['session_id']
                    username = session['username']

                    # Get current score
                    score_data = await get_slot_score(slot)
                    score = score_data.get('score', 0)

                    # Record in history
                    await conn.execute("""
                        INSERT INTO score_history (username, session_id, score, items_produced)
                        VALUES ($1, $2, $3, $4)
                    """, username, session_id, score, json.dumps(score_data.get('items', {})))

                    # Broadcast to websockets
                    if session_id in active_websockets:
                        message = json.dumps({
                            "type": "score_update",
                            "score": score,
                            "timestamp": datetime.utcnow().isoformat()
                        })
                        for ws in active_websockets[session_id]:
                            try:
                                await ws.send_text(message)
                            except:
                                pass

        except Exception as e:
            print(f"Score polling error: {e}")


async def session_timeout_checker():
    """Check for and clean up expired sessions."""
    while True:
        await asyncio.sleep(60)  # Check every minute
        try:
            cutoff = datetime.utcnow() - timedelta(hours=config.SESSION_TIMEOUT_HOURS)
            async with db_pool.acquire() as conn:
                expired = await conn.fetch("""
                    SELECT session_id, username, slot
                    FROM sessions
                    WHERE status = 'active' AND started_at < $1
                """, cutoff)

                for session in expired:
                    print(f"Expiring session {session['session_id']} for {session['username']}")
                    # Auto-save before expiring
                    save_name = f"autosave_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"
                    save_path = config.SAVES_DIR / session['username'] / f"{save_name}.zip"

                    try:
                        await save_slot_state(session['slot'], save_path)
                        await conn.execute("""
                            INSERT INTO saves (username, save_name, file_path, score_at_save)
                            VALUES ($1, $2, $3, 0)
                            ON CONFLICT (username, save_name) DO UPDATE
                            SET last_played = NOW()
                        """, session['username'], save_name, str(save_path))
                    except Exception as e:
                        print(f"Error auto-saving: {e}")

                    # Mark session as expired
                    await conn.execute("""
                        UPDATE sessions
                        SET status = 'expired', ended_at = NOW()
                        WHERE session_id = $1
                    """, session['session_id'])

                    await release_slot_lock(session['slot'])

        except Exception as e:
            print(f"Session timeout checker error: {e}")


# ============== App Lifecycle ==============

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    asyncio.create_task(score_polling_loop())
    asyncio.create_task(session_timeout_checker())
    yield
    # Shutdown
    await close_db()


# ============== FastAPI App ==============

app = FastAPI(
    title="Claudetorio Session Broker",
    description="Manages Factorio AI agent sessions for the Claudetorio hackathon",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== API Endpoints ==============

@app.post("/api/session/claim", response_model=ClaimResponse)
async def claim_session(request: ClaimRequest, background_tasks: BackgroundTasks):
    """
    Claim a session slot for a user.

    - Creates user if doesn't exist
    - Assigns an available slot
    - Optionally loads a previous save
    - Returns connection info for Claude Code MCP and Factorio client
    """
    username = request.username.lower().strip()

    # Check if user already has active session
    async with db_pool.acquire() as conn:
        existing = await conn.fetchrow(
            "SELECT session_id, slot FROM sessions WHERE username = $1 AND status = 'active'",
            username
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"User '{username}' already has active session {existing['session_id']} on slot {existing['slot']}"
            )

    # Find and claim a free slot
    slot = await get_free_slot()
    if slot is None:
        raise HTTPException(
            status_code=503,
            detail="No slots available. Try again later or wait for a session to end."
        )

    if not await claim_slot_lock(slot, username):
        raise HTTPException(
            status_code=503,
            detail="Slot was claimed by another user. Please try again."
        )

    try:
        async with db_pool.acquire() as conn:
            # Ensure user exists
            await conn.execute(
                "INSERT INTO users (username) VALUES ($1) ON CONFLICT DO NOTHING",
                username
            )

            # Create session
            import uuid
            session_id = str(uuid.uuid4())[:8]

            await conn.execute("""
                INSERT INTO sessions (session_id, username, slot, status, save_loaded)
                VALUES ($1, $2, $3, 'active', $4)
            """, session_id, username, slot, request.save_name)

        # Load save or reset slot
        if request.save_name:
            save_path = config.SAVES_DIR / username / f"{request.save_name}.zip"
            if save_path.exists():
                background_tasks.add_task(load_save_to_slot, slot, save_path)
            else:
                await release_slot_lock(slot)
                async with db_pool.acquire() as conn:
                    await conn.execute(
                        "DELETE FROM sessions WHERE session_id = $1",
                        session_id
                    )
                raise HTTPException(
                    status_code=404,
                    detail=f"Save '{request.save_name}' not found"
                )
        else:
            background_tasks.add_task(reset_slot, slot)

        rcon_port = config.BASE_RCON_PORT + slot
        udp_port = config.BASE_UDP_PORT + slot
        expires_at = datetime.utcnow() + timedelta(hours=config.SESSION_TIMEOUT_HOURS)

        # MCP config that users will put in their Claude Code settings
        mcp_config = {
            "mcpServers": {
                "factorio": {
                    "command": "fle",
                    "args": ["mcp", "--port-offset", str(slot)],
                    "env": {
                        "FLE_SERVER_HOST": config.SERVER_HOST,
                        "FLE_RCON_PORT": str(rcon_port),
                        "FLE_RCON_PASSWORD": config.RCON_PASSWORD
                    }
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
            spectate_address=f"{config.SERVER_HOST}:{udp_port}",
            expires_at=expires_at,
        )

    except HTTPException:
        raise
    except Exception as e:
        await release_slot_lock(slot)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/session/{session_id}/release")
async def release_session(session_id: str, request: ReleaseRequest):
    """
    Release a session, optionally saving the game state.

    - Saves game if save_name provided
    - Updates user's best score
    - Frees the slot for other users
    """
    async with db_pool.acquire() as conn:
        session = await conn.fetchrow(
            "SELECT * FROM sessions WHERE session_id = $1 AND status = 'active'",
            session_id
        )
        if not session:
            raise HTTPException(
                status_code=404,
                detail="Session not found or already ended"
            )

        slot = session['slot']
        username = session['username']
        started_at = session['started_at']

        # Get final score
        score_data = await get_slot_score(slot)
        final_score = score_data.get('score', 0)

        # Calculate playtime
        playtime_seconds = int((datetime.utcnow() - started_at.replace(tzinfo=None)).total_seconds())

        # Save if requested
        if request.save_name:
            save_path = config.SAVES_DIR / username / f"{request.save_name}.zip"
            await save_slot_state(slot, save_path)

            await conn.execute("""
                INSERT INTO saves (username, save_name, file_path, score_at_save, playtime_seconds)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (username, save_name) DO UPDATE
                SET last_played = NOW(), score_at_save = $4,
                    playtime_seconds = saves.playtime_seconds + $5
            """, username, request.save_name, str(save_path), final_score, playtime_seconds)

        # Update session
        await conn.execute("""
            UPDATE sessions
            SET status = 'completed', ended_at = NOW(), final_score = $1, save_created = $2
            WHERE session_id = $3
        """, final_score, request.save_name, session_id)

        # Update user stats
        await conn.execute("""
            UPDATE users
            SET best_score = GREATEST(best_score, $1),
                total_playtime_seconds = total_playtime_seconds + $2
            WHERE username = $3
        """, final_score, playtime_seconds, username)

        # Release slot
        await release_slot_lock(slot)

        # Clean up websockets
        if session_id in active_websockets:
            del active_websockets[session_id]

    return {
        "status": "released",
        "final_score": final_score,
        "playtime_minutes": playtime_seconds // 60,
        "saved_as": request.save_name
    }


@app.get("/api/session/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str):
    """Get details about a specific session."""
    async with db_pool.acquire() as conn:
        session = await conn.fetchrow(
            "SELECT * FROM sessions WHERE session_id = $1",
            session_id
        )
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        current_score = 0.0
        if session['status'] == 'active':
            score_data = await get_slot_score(session['slot'])
            current_score = score_data.get('score', 0)
        else:
            current_score = session['final_score'] or 0.0

        return SessionInfo(
            session_id=session['session_id'],
            username=session['username'],
            slot=session['slot'],
            started_at=session['started_at'],
            expires_at=session['started_at'] + timedelta(hours=config.SESSION_TIMEOUT_HOURS),
            current_score=current_score,
            status=session['status'],
        )


@app.websocket("/api/session/{session_id}/stream")
async def session_stream(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time score updates."""
    await websocket.accept()

    # Verify session exists and is active
    async with db_pool.acquire() as conn:
        session = await conn.fetchrow(
            "SELECT status FROM sessions WHERE session_id = $1",
            session_id
        )
        if not session or session['status'] != 'active':
            await websocket.close(code=4004, reason="Session not found or inactive")
            return

    # Add to active websockets
    if session_id not in active_websockets:
        active_websockets[session_id] = []
    active_websockets[session_id].append(websocket)

    try:
        while True:
            # Keep connection alive, actual updates come from score_polling_loop
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if session_id in active_websockets:
            active_websockets[session_id].remove(websocket)


@app.get("/api/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(limit: int = 50):
    """Get the top players by best score."""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT
                u.username,
                u.best_score,
                u.total_playtime_seconds,
                COUNT(s.session_id) as sessions_played,
                MAX(s.started_at) as last_played
            FROM users u
            LEFT JOIN sessions s ON s.username = u.username
            WHERE u.best_score > 0
            GROUP BY u.username, u.best_score, u.total_playtime_seconds
            ORDER BY u.best_score DESC
            LIMIT $1
        """, limit)

        return [
            LeaderboardEntry(
                rank=i + 1,
                username=row['username'],
                best_score=row['best_score'],
                total_playtime_hours=row['total_playtime_seconds'] / 3600,
                sessions_played=row['sessions_played'],
                last_played=row['last_played'],
            )
            for i, row in enumerate(rows)
        ]


@app.get("/api/users/{username}/saves", response_model=List[UserSave])
async def get_user_saves(username: str):
    """Get all saves for a specific user."""
    username = username.lower()
    async with db_pool.acquire() as conn:
        # Check user exists
        user = await conn.fetchrow(
            "SELECT username FROM users WHERE username = $1",
            username
        )
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        rows = await conn.fetch("""
            SELECT save_name, created_at, last_played, score_at_save, playtime_seconds
            FROM saves
            WHERE username = $1
            ORDER BY last_played DESC
        """, username)

        return [
            UserSave(
                save_name=row['save_name'],
                created_at=row['created_at'],
                last_played=row['last_played'],
                score_at_save=row['score_at_save'],
                playtime_hours=row['playtime_seconds'] / 3600,
            )
            for row in rows
        ]


@app.get("/api/users/{username}")
async def get_user(username: str):
    """Get user profile and stats."""
    username = username.lower()
    async with db_pool.acquire() as conn:
        user = await conn.fetchrow("""
            SELECT
                u.*,
                COUNT(s.session_id) as total_sessions,
                MAX(s.started_at) as last_session
            FROM users u
            LEFT JOIN sessions s ON s.username = u.username
            WHERE u.username = $1
            GROUP BY u.username, u.created_at, u.best_score, u.total_playtime_seconds
        """, username)

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Get rank
        rank = await conn.fetchval("""
            SELECT COUNT(*) + 1 FROM users WHERE best_score > $1
        """, user['best_score'])

        return {
            "username": user['username'],
            "created_at": user['created_at'],
            "best_score": user['best_score'],
            "total_playtime_hours": user['total_playtime_seconds'] / 3600,
            "total_sessions": user['total_sessions'],
            "last_session": user['last_session'],
            "rank": rank if user['best_score'] > 0 else None,
        }


@app.get("/api/status", response_model=SystemStatus)
async def get_status():
    """Get overall system status - useful for monitoring and the frontend."""
    async with db_pool.acquire() as conn:
        active_sessions = await conn.fetch(
            "SELECT session_id, username, slot, started_at FROM sessions WHERE status = 'active'"
        )
        total_users = await conn.fetchval("SELECT COUNT(*) FROM users")
        total_sessions = await conn.fetchval("SELECT COUNT(*) FROM sessions")

    return SystemStatus(
        total_slots=config.TOTAL_SLOTS,
        available_slots=config.TOTAL_SLOTS - len(active_sessions),
        active_sessions=[
            {
                "session_id": s['session_id'],
                "username": s['username'],
                "slot": s['slot'],
                "started_at": s['started_at'].isoformat(),
            }
            for s in active_sessions
        ],
        total_users=total_users,
        total_sessions_all_time=total_sessions,
    )


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    try:
        async with db_pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        await redis_client.ping()
        return {"status": "healthy"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


# ============== Run ==============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
