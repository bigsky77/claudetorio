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


def create_app() -> FastAPI:
    app_state = AppState()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Startup
        await init_db()
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

