FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app/stream-worker

# Copy fle (dependency) and stream-worker source
COPY fle/ /app/fle/
COPY stream-worker/ /app/stream-worker/

RUN uv sync --no-dev

CMD ["uv", "run", "python", "main.py"]
