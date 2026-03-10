import argparse
import asyncio
import logging
import os

from dotenv import load_dotenv

# Load .env BEFORE any FLE imports — FLE captures env vars at module-level import time.
load_dotenv()

# Surface retry errors from APIFactory.acall (tenacity logs to "tenacity" logger)
logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(name)s %(levelname)s: %(message)s")
logging.getLogger("openai").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)

from agent_loop import run  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Claudetorio autonomous agent worker")
    parser.add_argument("--steps", type=int, default=10, help="Number of agent steps to run")
    parser.add_argument("--broker-url", type=str, default=os.getenv("BROKER_URL", "http://localhost:8080"), help="Broker API URL")
    parser.add_argument("--username", type=str, default=os.getenv("BROKER_USERNAME", "run_worker"), help="Username for session claim")
    args = parser.parse_args()

    asyncio.run(run(steps=args.steps, broker_url=args.broker_url, username=args.username))


if __name__ == "__main__":
    main()
