FROM python:3.11-slim

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy project metadata and install dependencies
COPY pyproject.toml .
RUN uv sync --no-dev --no-install-project

# Copy application code
COPY app/ app/
COPY main.py .

# Create non-root user
RUN useradd -m -u 1000 broker
USER broker

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
