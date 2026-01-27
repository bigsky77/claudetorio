# Broker Refactor: Horizontal Scaling & Fault Tolerance

## Summary

The broker currently works well as a single instance but has several architectural limitations that prevent horizontal scaling and reduce fault tolerance. This issue tracks the work needed to make the system production-ready for multiple broker instances.

## Current State

- Single FastAPI service (~825 lines in `main.py`)
- PostgreSQL for persistent state
- Redis for slot locking
- RCON for FLE game server communication
- WebSocket for real-time score updates

## Problems

### P0: Horizontal Scaling Blockers

#### 1. In-Memory WebSocket Registry
**Location:** `broker/main.py:50`

```python
active_websockets: Dict[str, List[WebSocket]] = {}  # session_id -> websockets
```

**Problem:** WebSocket connections are stored in a per-instance dict. If you run 2 broker instances behind a load balancer:
- Client connects to Instance A
- Score polling runs on Instance B
- Instance B can't push to client on Instance A

**Solution:** Use Redis Pub/Sub for WebSocket message distribution:
```python
# On score update (any instance):
await redis_client.publish(f"session:{session_id}:scores", json.dumps(score_data))

# Each instance subscribes and forwards to its local websockets:
async def websocket_relay():
    pubsub = redis_client.pubsub()
    await pubsub.psubscribe("session:*:scores")
    async for message in pubsub.listen():
        session_id = message['channel'].split(':')[1]
        if session_id in local_websockets:
            # forward to local connections
```

#### 2. Background Tasks Run on Every Instance
**Location:** `broker/main.py:319-401`

**Problem:** `score_polling_loop()` and `session_timeout_checker()` are started via `asyncio.create_task()` in the lifespan. Every instance will run these, causing:
- Duplicate score records in `score_history`
- Race conditions in session expiration
- N× RCON load for N instances

**Solution:** Implement leader election with Redis:
```python
async def try_become_leader() -> bool:
    """Attempt to claim leadership for background tasks."""
    return await redis_client.set(
        "broker:leader",
        instance_id,
        nx=True,
        ex=30  # 30 second lease
    )

async def leader_heartbeat():
    """Renew leadership lease while running."""
    while True:
        await redis_client.set("broker:leader", instance_id, xx=True, ex=30)
        await asyncio.sleep(10)
```

Alternative: Use a dedicated worker process or Celery Beat for scheduled tasks.

#### 3. No Graceful Degradation
**Problem:** If RCON to a slot fails, the entire score polling cycle logs an error but continues. No circuit breaker, no backoff.

**Solution:**
- Track slot health status in Redis
- Implement exponential backoff per slot
- Mark slots as unhealthy after N failures
- Don't allocate unhealthy slots to new sessions

---

### P1: Reliability Issues

#### 4. Blocking RCON Calls
**Location:** `broker/main.py:193-196, 204-229`

```python
def get_rcon_connection(slot: int) -> MCRcon:
    return MCRcon("localhost", config.RCON_PASSWORD, port=port)

# Used synchronously:
with get_rcon_connection(slot) as rcon:
    response = rcon.command(...)  # BLOCKS THE EVENT LOOP
```

**Problem:** `MCRcon` is synchronous. In an async FastAPI app, this blocks the entire event loop during RCON communication.

**Solution:** Run RCON calls in a thread pool:
```python
async def get_slot_score(slot: int) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,  # default thread pool
        _sync_get_slot_score,
        slot
    )

def _sync_get_slot_score(slot: int) -> dict:
    """Synchronous RCON call, runs in thread."""
    with get_rcon_connection(slot) as rcon:
        response = rcon.command(...)
    return parse_response(response)
```

Or switch to an async RCON library.

#### 5. No Session Recovery
**Problem:** If the broker crashes while sessions are active:
- Redis locks have TTL and will expire
- Sessions in DB still show `status='active'`
- Slots could be double-allocated on restart

**Solution:** Add startup reconciliation:
```python
async def reconcile_sessions_on_startup():
    """Clean up orphaned sessions from previous crash."""
    async with db_pool.acquire() as conn:
        # Find sessions that claim to be active
        active = await conn.fetch(
            "SELECT session_id, slot FROM sessions WHERE status = 'active'"
        )
        for session in active:
            # Check if Redis lock still exists
            lock_owner = await redis_client.get(f"slot_lock:{session['slot']}")
            if not lock_owner:
                # Lock expired, mark session as crashed
                await conn.execute("""
                    UPDATE sessions SET status = 'crashed', ended_at = NOW()
                    WHERE session_id = $1
                """, session['session_id'])
```

#### 6. No Retry Logic for RCON
**Location:** `broker/main.py:232-258`

**Problem:** If RCON fails (network blip, server restart), operations just fail.

**Solution:** Add retries with exponential backoff:
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
def _rcon_command(slot: int, command: str) -> str:
    with get_rcon_connection(slot) as rcon:
        return rcon.command(command)
```

---

### P2: Code Quality

#### 7. Monolithic File Structure
**Current:** Everything in one 825-line file.

**Proposed Structure:**
```
broker/
├── __init__.py
├── main.py              # FastAPI app, routes
├── config.py            # Configuration class
├── models.py            # Pydantic models
├── db/
│   ├── __init__.py
│   ├── pool.py          # Connection pool management
│   ├── migrations/      # Alembic migrations
│   └── queries.py       # Database operations
├── services/
│   ├── __init__.py
│   ├── sessions.py      # Session lifecycle
│   ├── slots.py         # Slot management
│   ├── scores.py        # Score tracking
│   └── saves.py         # Save file management
├── fle/
│   ├── __init__.py
│   └── rcon.py          # RCON client wrapper
├── workers/
│   ├── __init__.py
│   ├── score_poller.py  # Background score polling
│   └── timeout_checker.py
└── tests/
    └── ...
```

#### 8. Missing Observability
**Problem:** Only `print()` statements for logging. No metrics, no tracing.

**Solution:**
```python
import logging
import structlog
from opentelemetry import trace

logger = structlog.get_logger()

@app.post("/api/session/claim")
async def claim_session(request: ClaimRequest):
    logger.info("session_claim_requested", username=request.username)
    # ...
    logger.info("session_claimed", session_id=session_id, slot=slot)
```

Add Prometheus metrics:
```python
from prometheus_client import Counter, Histogram, Gauge

sessions_active = Gauge('broker_sessions_active', 'Active sessions')
session_claims = Counter('broker_session_claims_total', 'Total session claims')
rcon_latency = Histogram('broker_rcon_latency_seconds', 'RCON call latency')
```

#### 9. Database Migrations
**Problem:** Schema is created with `CREATE TABLE IF NOT EXISTS`. No way to evolve schema.

**Solution:** Add Alembic:
```bash
pip install alembic
alembic init broker/db/migrations
```

#### 10. Security Hardening
**Location:** `broker/main.py:426-432`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Too permissive
    ...
)
```

**Solution:** Restrict to known origins:
```python
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    ...
)
```

---

## Implementation Plan

### Phase 1: Foundation (Non-Breaking)
- [ ] Split `main.py` into modules
- [ ] Add structured logging
- [ ] Add Alembic migrations
- [ ] Wrap RCON calls in thread pool executor
- [ ] Add retry logic to RCON

### Phase 2: Horizontal Scaling
- [ ] Implement Redis Pub/Sub for WebSocket distribution
- [ ] Add leader election for background tasks
- [ ] Add startup reconciliation for crashed sessions
- [ ] Add health checks per slot

### Phase 3: Production Readiness
- [ ] Add Prometheus metrics
- [ ] Add OpenTelemetry tracing
- [ ] Restrict CORS origins
- [ ] Add rate limiting
- [ ] Add API authentication (for admin endpoints)

### Phase 4: Advanced
- [ ] Circuit breaker for RCON
- [ ] Slot health tracking and auto-recovery
- [ ] Graceful shutdown with session handoff
- [ ] Multi-region support (if needed)

---

## Acceptance Criteria

- [ ] Can run 3 broker instances behind a load balancer
- [ ] WebSocket updates work regardless of which instance handles the connection
- [ ] Only one instance runs background tasks at a time
- [ ] If leader instance crashes, another takes over within 30 seconds
- [ ] No duplicate score records in `score_history`
- [ ] Sessions recover gracefully after broker restart
- [ ] All operations have structured logs with correlation IDs
- [ ] Prometheus metrics available at `/metrics`

---

## References

- [FastAPI Background Tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/)
- [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)
- [Redlock Algorithm](https://redis.io/docs/manual/patterns/distributed-locks/)
- [Tenacity Retry Library](https://tenacity.readthedocs.io/)
