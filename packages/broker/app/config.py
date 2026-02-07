import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


class Config:
    TOTAL_SLOTS = 20
    BASE_RCON_PORT = int(os.getenv("BASE_RCON_PORT", "27000"))
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
    # Auth keys
    BROKER_ADMIN_KEY = os.getenv("BROKER_ADMIN_KEY", "")
    RUN_WORKER_API_KEY = os.getenv("RUN_WORKER_API_KEY", "")
    # Path to run-worker package
    RUN_WORKER_DIR = Path(os.getenv("RUN_WORKER_DIR", str(Path(__file__).resolve().parent.parent.parent / "run-worker")))
    # Stream server configuration
    # Subdomain routing through Caddy: c0.stream.claudetorio.ai, c1.stream.claudetorio.ai, etc.
    # Legacy: port-based routing (e.g., https://host:3003/) - used if STREAM_DOMAIN is not set
    STREAM_DOMAIN = os.getenv("STREAM_DOMAIN", "")  # e.g., "stream.claudetorio.ai"
    STREAM_BASE_URL = os.getenv("STREAM_BASE_URL", "https://localhost")  # Legacy fallback
    STREAM_BASE_PORT = int(os.getenv("STREAM_BASE_PORT", "3003"))  # Legacy: Slot 0 = 3003, Slot 1 = 3004, etc.

    @classmethod
    def get_stream_url(cls, slot: int) -> str:
        """Get the stream URL for a given slot."""
        if cls.STREAM_DOMAIN:
            # Subdomain-based routing: c0.stream.domain, c1.stream.domain, etc.
            return f"https://c{slot}.{cls.STREAM_DOMAIN}/"
        else:
            # Legacy port-based routing
            port = cls.STREAM_BASE_PORT + slot
            return f"{cls.STREAM_BASE_URL}:{port}/"


config = Config()
