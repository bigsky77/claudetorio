FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app/run-worker

# Copy fle (dependency) and run-worker source
COPY fle/ /app/fle/
COPY run-worker/ /app/run-worker/

RUN uv sync --no-dev

CMD ["uv", "run", "python", "main.py"]
