import asyncio
from typing import Dict, List

import redis.asyncio as redis
from fastapi import WebSocket

from .config import config


class AppState:
    def __init__(self):
        self.redis: redis.Redis = None
        self.active_websockets: Dict[str, List[WebSocket]] = {}
        self.run_processes: Dict[str, asyncio.subprocess.Process] = {}
        self.pending_run_envs: Dict[str, dict] = {}
        # key = run_id, value = {"slot": int, "stream_url": str, "proc": asyncio.subprocess.Process | None}
        self.active_replays: Dict[str, dict] = {}

    async def init_redis(self):
        self.redis = redis.Redis(
            host=config.REDIS_HOST,
            port=6379,
            decode_responses=True,
        )

    async def close_redis(self):
        if self.redis:
            await self.redis.close()
