import os
from pathlib import Path
from urllib.parse import urlparse

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
    # Docker settings for run-worker containers
    RUN_WORKER_IMAGE = os.getenv("RUN_WORKER_IMAGE", "claudetorio-run-worker")
    DOCKER_NETWORK = os.getenv("DOCKER_NETWORK", "")
    # Docker settings for stream-client containers
    STREAM_CLIENT_IMAGE = os.getenv("STREAM_CLIENT_IMAGE", "claudetorio-stream-client")
    FACTORIO_CLIENT_PATH = os.getenv("FACTORIO_CLIENT_PATH", "")  # host path to Factorio client install
    FACTORIO_CLIENT_VOLUME = os.getenv("FACTORIO_CLIENT_VOLUME", "")  # Docker volume with Factorio client files
    STREAM_CLIENT_NETWORK = os.getenv("STREAM_CLIENT_NETWORK", "")  # may differ from DOCKER_NETWORK in prod
    # Docker settings for dynamic Factorio server containers
    FACTORIO_IMAGE = os.getenv("FACTORIO_IMAGE", "")  # e.g. "factoriotools/factorio:1.1.110"
    FACTORIO_CONFIG_PATH = os.getenv("FACTORIO_CONFIG_PATH", "")  # host path to config/factorio dir
    FACTORIO_CONFIG_VOLUME = os.getenv("FACTORIO_CONFIG_VOLUME", "")  # Docker volume name with config files
    FACTORIO_SCENARIOS_VOLUME = os.getenv("FACTORIO_SCENARIOS_VOLUME", "")  # Docker volume with FLE scenario files
    FACTORIO_SCENARIOS_PATH = os.getenv("FACTORIO_SCENARIOS_PATH", "")  # host path to scenario files
    # Stream server configuration (port-based public access)
    # STREAM_URL is preferred; STREAM_BASE_URL is kept for backward compatibility.
    STREAM_URL = os.getenv("STREAM_URL", os.getenv("STREAM_BASE_URL", "http://localhost"))
    STREAM_BASE_PORT = int(os.getenv("STREAM_BASE_PORT", "3003"))  # Slot 0 = 3003, Slot 1 = 3004, etc.
    STREAM_PUBLIC_HOST = os.getenv("STREAM_PUBLIC_HOST", "")  # Optional explicit public host/IP for frontend metadata
    # Replay containers
    STREAM_WORKER_IMAGE = os.getenv("STREAM_WORKER_IMAGE", "claudetorio-stream-worker")
    REPLAY_STREAM_BASE_PORT = int(os.getenv("REPLAY_STREAM_BASE_PORT", "4002"))
    REPLAY_UDP_BASE_PORT = int(os.getenv("REPLAY_UDP_BASE_PORT", "35100"))
    REPLAY_RCON_BASE_PORT = int(os.getenv("REPLAY_RCON_BASE_PORT", "28000"))
    STEP_INTERVAL = float(os.getenv("STEP_INTERVAL", "5.0"))
    STREAM_CLIENT_SETTLE_TIME = int(os.getenv("STREAM_CLIENT_SETTLE_TIME", "20"))
    # Two-server deployment: stream-agent on stream-server handles stream-client spawning
    STREAM_AGENT_URL = os.getenv("STREAM_AGENT_URL", "")       # e.g. http://157.254.222.104:8090
    STREAM_AGENT_KEY = os.getenv("STREAM_AGENT_KEY", "")       # shared secret
    GAME_SERVER_PUBLIC_HOST = os.getenv("GAME_SERVER_PUBLIC_HOST", "")    # 157.254.222.103
    STREAM_SERVER_PUBLIC_HOST = os.getenv("STREAM_SERVER_PUBLIC_HOST", "")  # 157.254.222.104
    STREAM_DOMAIN = os.getenv("STREAM_DOMAIN", "")  # e.g. "stream.claudetorio.ai"; empty = port-based (dev)
    # API keys (forwarded to worker/vtuber containers)
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    # VTuber stream-client containers
    VTUBER_STREAM_CLIENT_IMAGE = os.getenv("VTUBER_STREAM_CLIENT_IMAGE", "claudetorio-vtuber-stream-client")
    VTUBER_STREAM_BASE_PORT = int(os.getenv("VTUBER_STREAM_BASE_PORT", "5002"))
    VTUBER_REPLAY_STREAM_BASE_PORT = int(os.getenv("VTUBER_REPLAY_STREAM_BASE_PORT", "6002"))
    # Keys forwarded to vtuber containers
    ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
    ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "jqcCZkN6Knx8BJ5TBdYR")

    @classmethod
    def get_udp_port(cls, slot: int) -> int:
        """Get the Factorio UDP port for a given slot."""
        return cls.BASE_UDP_PORT + slot

    @classmethod
    def get_stream_public_endpoint(cls, slot: int) -> dict[str, str | int]:
        """Get public stream endpoint metadata for a given slot."""
        parsed = urlparse(cls.STREAM_URL)
        scheme = parsed.scheme or "http"
        if cls.STREAM_DOMAIN:
            # Production: Caddy wildcard subdomain routing
            return {
                "stream_url": f"{scheme}://c{slot}.{cls.STREAM_DOMAIN}/",
                "stream_host": f"c{slot}.{cls.STREAM_DOMAIN}",
                "stream_port": 443 if scheme == "https" else 80,
                "stream_scheme": scheme,
            }
        # Dev/local: port-based direct access
        parsed_host = parsed.hostname or parsed.path
        host = cls.STREAM_PUBLIC_HOST or parsed_host or "localhost"
        port = cls.STREAM_BASE_PORT + slot
        return {
            "stream_url": f"{scheme}://{host}:{port}/",
            "stream_host": host,
            "stream_port": port,
            "stream_scheme": scheme,
        }

    @classmethod
    def get_stream_url(cls, slot: int) -> str:
        """Get the stream URL for a given slot."""
        return str(cls.get_stream_public_endpoint(slot)["stream_url"])

    @classmethod
    def get_replay_stream_public_endpoint(cls, slot: int) -> dict[str, str | int]:
        """Get public stream endpoint metadata for a replay slot."""
        parsed = urlparse(cls.STREAM_URL)
        scheme = parsed.scheme or "http"
        if cls.STREAM_DOMAIN:
            return {
                "stream_url": f"{scheme}://cr{slot}.{cls.STREAM_DOMAIN}/",
                "stream_host": f"cr{slot}.{cls.STREAM_DOMAIN}",
                "stream_port": 443 if scheme == "https" else 80,
                "stream_scheme": scheme,
            }
        parsed_host = parsed.hostname or parsed.path
        host = cls.STREAM_PUBLIC_HOST or parsed_host or "localhost"
        port = cls.REPLAY_STREAM_BASE_PORT + slot
        return {
            "stream_url": f"{scheme}://{host}:{port}/",
            "stream_host": host,
            "stream_port": port,
            "stream_scheme": scheme,
        }

    @classmethod
    def get_vtuber_stream_url(cls, slot: int) -> str:
        """Public URL for the vtuber-stream-client for a replay slot."""
        parsed = urlparse(cls.STREAM_URL)
        scheme = parsed.scheme or "http"
        if cls.STREAM_DOMAIN:
            return f"{scheme}://cvr{slot}.{cls.STREAM_DOMAIN}/"
        parsed_host = parsed.hostname or parsed.path
        host = cls.STREAM_PUBLIC_HOST or parsed_host or "localhost"
        return f"{scheme}://{host}:{cls.VTUBER_REPLAY_STREAM_BASE_PORT + slot}/"


config = Config()
