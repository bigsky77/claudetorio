# Local Development

Ultra-tight local dev stack for ClaudeTorio. Matches prod topology: worlds are cheap and numerous, streams are scarce and stable.

## Architecture

```
Host (hot reload)                Docker (infra + worlds)
─────────────────                ────────────────────────
broker   :8080  ──RCON──────►  factorio_0  :27000 / :34197
frontend :3000                  factorio_1  :27001 / :34198
                                postgres    :5432
                                redis       :6379
                                stream_client_0 :3002 (optional)
```

- **Broker + Frontend** run on the host for instant reload
- **Everything else** runs in Docker via `docker compose`

## Prerequisites

- Docker + Docker Compose v2
- Python 3.11+ (for broker)
- Node.js 20+ (for frontend)
- Optional: Factorio GUI install for stream client testing

## One-Time Setup (~10 minutes)

```bash
# 1. Create local env file
cd dev/
cp .env.example .env

# 2. Create local data directories
mkdir -p data/saves data/fle-saves

# 3. Install broker dependencies
cd ../packages/broker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Install frontend dependencies
cd ../frontend
npm install
cp .env.local.example .env.local
```

## Daily Workflow (2 terminals, no rebuilds)

### Terminal A: Docker infra

```bash
cd dev/
docker compose up
```

This starts: postgres, redis, factorio_0 (slot 0), factorio_1 (slot 1).

### Terminal B: Broker + Frontend

```bash
# Start broker (from repo root)
cd packages/broker
source .venv/bin/activate
set -a; source ../../dev/.env; set +a
uvicorn main:app --reload --host 0.0.0.0 --port 8080

# In another terminal/tab, start frontend
cd packages/frontend
npm run dev
```

### That's it

- Frontend: http://localhost:3000
- Broker API: http://localhost:8080
- Broker docs: http://localhost:8080/docs

## Port Map

| Service | Port | Protocol |
|---------|------|----------|
| Frontend | 3000 | HTTP |
| Broker API | 8080 | HTTP |
| PostgreSQL | 5432 | TCP |
| Redis | 6379 | TCP |
| Factorio slot 0 game | 34197 | UDP |
| Factorio slot 0 RCON | 27000 | TCP |
| Factorio slot 1 game | 34198 | UDP |
| Factorio slot 1 RCON | 27001 | TCP |
| Stream client 0 | 3002 | HTTP |

## Stream Client (Optional)

To test streaming locally:

1. Place a full Factorio GUI install (v1.1.110) at `dev/factorio-client/` (gitignored)
2. Uncomment the `stream_client_0` service and `stream_client_0_data` volume in `docker-compose.yml`
3. `docker compose up`
4. Open http://localhost:3002 to see the stream

## Scaling

Start with 2 worlds and 1 stream client. Only bump up when needed:

- **5-10 worlds**: debugging allocation + ranking logic
- **2-3 stream clients**: debugging pool assignment and prewarming

Add more slots by duplicating `factorio_N` services in `docker-compose.yml` with incremented ports, and setting `TOTAL_SLOTS` in `.env`.

## Troubleshooting

```bash
# View factorio logs
docker compose logs -f factorio_0

# Reset database
docker compose down -v && docker compose up

# Test RCON connectivity
python -c "from mcrcon import MCRcon; r=MCRcon('localhost','dev_rcon_password',port=27000); r.connect(); print(r.command('/version')); r.disconnect()"
```

## Legacy

The previous all-in-one compose (with broker+frontend in Docker) is preserved at `docker-compose.legacy.yml` for reference.
