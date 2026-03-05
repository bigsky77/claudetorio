import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .db import init_db, close_db
from .routes import all_routers
from .state import AppState
from .tasks import score_polling_loop, session_timeout_checker


async def _backfill_final_scores():
    """One-time backfill: compute final_score from steps for runs that have steps but no score."""
    from sqlalchemy import select, func
    from .db import async_session_factory
    from .models import Run, RunStep

    async with async_session_factory() as db:
        # Find runs with NULL final_score that have steps with production_score
        stmt = (
            select(Run.run_id)
            .where(Run.final_score.is_(None))
            .where(Run.status.in_(["completed", "failed", "stopped"]))
        )
        result = await db.execute(stmt)
        run_ids = [row[0] for row in result.all()]

        updated = 0
        for run_id in run_ids:
            score_result = await db.execute(
                select(func.max(RunStep.production_score)).where(RunStep.run_id == run_id)
            )
            max_score = score_result.scalar()
            if max_score and max_score > 0:
                await db.execute(
                    Run.__table__.update()
                    .where(Run.__table__.c.run_id == run_id)
                    .values(final_score=max_score)
                )
                updated += 1

        if updated:
            await db.commit()
            logging.info(f"Backfilled final_score for {updated} runs")


def create_app() -> FastAPI:
    app_state = AppState()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup
        await init_db()
        await _backfill_final_scores()
        await app_state.init_redis()
        asyncio.create_task(score_polling_loop(app_state))
        asyncio.create_task(session_timeout_checker(app_state))
        yield
        # Shutdown
        await app_state.close_redis()
        await close_db()

    app = FastAPI(
        title="Claudetorio Session Broker",
        description="Manages Factorio AI agent sessions for the Claudetorio hackathon",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.state.app_state = app_state

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(RequestValidationError)
    async def log_validation_error(request: Request, exc: RequestValidationError):
        logging.warning(f"422 on {request.method} {request.url.path}: {exc.errors()}")
        return JSONResponse(status_code=422, content={"detail": exc.errors()})

    for router in all_routers:
        app.include_router(router)

    return app

