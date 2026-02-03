# ClaudeTorio Broker

FastAPI session broker for managing Factorio game sessions.

## Features

- Session management (create, join, spectate)
- Game state synchronization with FLE
- WebSocket support for real-time updates
- PostgreSQL for persistence
- Redis for caching and pub/sub

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `FACTORIO_RCON_HOST` - Factorio server hostname
- `FACTORIO_RCON_PORT` - RCON port (default: 27015)
- `FACTORIO_RCON_PASSWORD` - RCON password

## Running Locally

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
```

## Docker

```bash
docker build -t claudetorio-broker .
docker run -p 8080:8080 --env-file .env claudetorio-broker
```

## API Endpoints

- `GET /api/status` - Health check and server status
- `GET /api/sessions` - List active sessions
- `POST /api/sessions` - Create new session
- `GET /api/leaderboard` - Get player leaderboard
