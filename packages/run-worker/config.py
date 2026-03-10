import os

DEFAULT_MODEL = "claude-sonnet-4-5-20250929"

MODEL = os.getenv("MODEL", DEFAULT_MODEL)
RUN_ID = os.getenv("RUN_ID")
RUN_WORKER_API_KEY = os.getenv("RUN_WORKER_API_KEY", "")
BROKER_URL = os.getenv("BROKER_URL", "http://localhost:8080")
SERVER_HOST = os.getenv("SERVER_HOST", "localhost")
RCON_PORT = os.getenv("RCON_PORT")
RCON_PASSWORD = os.getenv("RCON_PASSWORD", "")
CUSTOM_API = os.getenv("CUSTOM_API", "").lower() in ("true", "1", "yes")
CUSTOM_API_URL = os.getenv("CUSTOM_API_URL")
CUSTOM_API_KEY = os.getenv("CUSTOM_API_KEY")
FORCE_LLM_PROVIDER = (os.getenv("FORCE_LLM_PROVIDER", "") or "").strip().lower() or None
