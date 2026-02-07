from .sessions import router as sessions_router
from .users import router as users_router
from .leaderboard import router as leaderboard_router
from .system import router as system_router
from .runs import router as runs_router
from .internal import router as internal_router

all_routers = [
    sessions_router,
    users_router,
    leaderboard_router,
    system_router,
    runs_router,
    internal_router,
]
