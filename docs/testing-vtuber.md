# Testing the VTuber Stream Client Locally

Step-by-step guide for running the full vtuber-stream-client stack on your dev machine.

---

## Prerequisites

- Docker Desktop (or Docker Engine) with `linux/amd64` emulation (Rosetta on Apple Silicon)
- Factorio Linux client files — a volume named `claudetorio_factorio_client` must exist (see below)
- Optional: `ANTHROPIC_API_KEY` for commentary narration
- Optional: `ELEVENLABS_API_KEY` for TTS audio

### One-time: create the Factorio client volume

```bash
# If you have a local Factorio Linux client directory:
docker volume create claudetorio_factorio_client
docker run --rm -v claudetorio_factorio_client:/dst \
  -v /path/to/factorio-linux:/src:ro \
  alpine sh -c "cp -a /src/. /dst/"
```

---

## 1. Build images

```bash
# Build all broker-spawned images (required before broker can start them)
docker compose -f dev/docker-compose.yml build \
  stream-client run-worker stream-worker vtuber-stream-client
```

The `vtuber-stream-client` build takes several minutes (Chrome download).

---

## 2. Start core services

```bash
docker compose -f dev/docker-compose.yml up broker frontend postgres redis
```

Wait for `broker` to log `Application startup complete.`

---

## 3. Create a run

```bash
curl -s -X POST http://localhost:8080/api/runs \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: dev" \
  -d '{"max_steps": 10}' | jq .
```

Note the `id` field — use it as `RUN_ID` below.

---

## 4. Start the run worker

```bash
curl -s -X POST "http://localhost:8080/api/runs/$RUN_ID/start-worker" \
  -H "X-Admin-Key: dev" | jq .
```


Poll until `status` is `completed` (or `failed`):

```bash
watch -n5 "curl -s http://localhost:8080/api/runs/$RUN_ID | jq '{status, step_count: .steps|length}'"
```

---

## 5. Start replay with VTuber

```bash
curl -s -X POST "http://localhost:8080/api/runs/$RUN_ID/replay?vtuber=true" \
  -H "X-Admin-Key: dev" | jq .
```

This spawns:
- `factorio-replay-{run_id}` — Factorio headless server
- `stream-client-replay-0` — plain HLS stream (port 4002)
- `vtuber-stream-client-replay-0` — VTuber overlay stream (port 6002)

---

## 6. Start the replay worker

```bash
curl -s -X POST "http://localhost:8080/api/runs/$RUN_ID/replay/start-worker" \
  -H "X-Admin-Key: dev" | jq .
```

The stream-worker replays steps every 5 seconds (default `STEP_INTERVAL`).

---

## 7. Watch the streams

| Stream | URL |
|--------|-----|
| Plain replay (HLS player) | http://localhost:4002 |
| VTuber overlay (HLS player) | http://localhost:6002 |

Open either in a browser — they include an `hls.js` player at `/`.

Direct HLS manifest: `http://localhost:6002/stream.m3u8`

---

## 8. Frontend

The frontend at http://localhost:3000 shows active replays in the streams section. Navigate to `/stream/{RUN_ID}` to use the built-in viewer.

---

## 9. Test narration only (no Docker)

Run `narrate.py` directly against a local broker, useful for iterating on commentary logic:

```bash
cd packages/vtuber-stream-client

# Install dependencies (if not already)
pip install anthropic  # or uv pip install anthropic

export RUN_ID=<your-run-id>
export BROKER_URL=http://localhost:8080
export ANTHROPIC_API_KEY=sk-ant-...
export AVATAR_URL=http://localhost:12393  # Open-LLM-VTuber, or any HTTP server

python3 narrate.py
```

Without `ANTHROPIC_API_KEY`, narrate.py prints a warning and sleeps — no crash.

---

## 10. Debug container logs

```bash
# VTuber container logs (entrypoint + narrator)
docker logs -f vtuber-stream-client-replay-0

# Stream worker (step replay progress)
docker logs -f stream-worker-$RUN_ID

# Factorio replay server
docker logs -f factorio-replay-$RUN_ID

# Plain stream client
docker logs -f stream-client-replay-0
```

---

## 11. Teardown

```bash
# Stop replay
curl -s -X DELETE "http://localhost:8080/api/runs/$RUN_ID/replay" \
  -H "X-Admin-Key: dev"

# Stop any lingering containers
docker ps --filter name=run-worker \
          --filter name=factorio \
          --filter name=stream-worker \
          --filter name=vtuber-stream-client \
          -q | xargs -r docker stop

# Tear down core stack
docker compose -f dev/docker-compose.yml down -v
```

---

## Checklist

- [ ] `vtuber-stream-client` build completes without error
- [ ] Without API keys: container starts, logs show `narration disabled`, HLS plays (video + overlay, no audio)
- [ ] With API keys: narration commentary appears in stream ~30s after start
- [ ] `GET http://localhost:8080/api/streams` returns the active replay entry
- [ ] Frontend `/stream/{runId}` loads and plays the HLS video
