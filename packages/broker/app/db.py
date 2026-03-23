from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from .config import config
from .models import Base

DATABASE_URL = (
    f"postgresql+asyncpg://{config.POSTGRES_USER}:{config.POSTGRES_PASSWORD}"
    f"@{config.POSTGRES_HOST}/{config.POSTGRES_DB}"
)

engine = create_async_engine(DATABASE_URL, pool_size=20, max_overflow=0)
async_session_factory = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    """Create all tables if they don't exist, and apply any incremental migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Incremental migrations (idempotent — safe on fresh or existing DBs)
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE runs DROP COLUMN IF EXISTS map_exchange_string"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE runs ADD COLUMN IF NOT EXISTS map_seed BIGINT"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE runs ALTER COLUMN map_seed TYPE BIGINT"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE runs ADD COLUMN IF NOT EXISTS scenario VARCHAR"
            )
        )
        await conn.execute(
            __import__("sqlalchemy").text(
                "ALTER TABLE runs ADD COLUMN IF NOT EXISTS github_user_id INTEGER REFERENCES github_users(id)"
            )
        )


async def close_db():
    """Dispose the engine connection pool."""
    await engine.dispose()
