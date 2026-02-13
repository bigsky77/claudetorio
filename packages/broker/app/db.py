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
    """Create all tables if they don't exist."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Dispose the engine connection pool."""
    await engine.dispose()
