# VTuber Livestream Architecture

## Overview

The vtuber-livestream feature adds an AI avatar commentary layer on top of Claudetorio's replay streams. A new `packages/vtuber-stream-client/` container runs alongside the existing `stream-client`, compositing:

- Factorio gameplay (left 75% of screen)
- A VTuber avatar (bottom-right, via Open-LLM-VTuber)
- A chat panel placeholder (right 25%)
- Narration: `narrate.py` polls broker steps, generates Claude commentary, speaks via ElevenLabs TTS → PulseAudio → FFmpeg → HLS stream

The HLS stream is served by nginx on port 3000 (same interface as stream-client). Optionally, FFmpeg simultaneously pushes to a Twitch or Kick RTMP ingest when `RTMP_URL` + `STREAM_KEY` are set.

The homepage is redesigned with a STREAMS grid, TOURNAMENT countdown, and BENCHMARKS section. A new `GET /api/streams` endpoint surfaces all streamable runs. A new frontend page `/stream/[runId]` provides a full-page viewer.

---

## Package: `packages/vtuber-stream-client/`

Parallel to `packages/stream-client/`. The Dockerfile extends Ubuntu 22.04 with:

- **Additional system packages:** PulseAudio, Google Chrome (signed apt repo), xdotool, Python 3.11 + uv
- **Additional Python scripts:** `narrate.py`, `speak.py`
- **Static assets:** `background.png` (purple starry night), `overlay.html`
- **Shared with stream-client:** `nginx.conf`, `scripts/start-factorio.sh`, `index.html`

### Container startup order (`entrypoint.sh`)

1. Start Xvfb at 1920×1080 on `:1`
2. Set desktop background image (`feh --bg-fill /background.png`)
3. Start PulseAudio with a virtual null sink (`virtual_speaker`)
4. Start Open-LLM-VTuber server on port 12393
5. Start Openbox window manager
6. Start Factorio client windowed at ~1430×1080 (left 75% of screen)
7. Start Chrome in kiosk mode rendering `overlay.html` (full 1920×1080, transparent game area, right-side chat + bottom-right avatar iframe)
8. Start `narrate.py` — polls broker for new steps, generates Claude commentary, speaks via ElevenLabs TTS → PulseAudio
9. Start FFmpeg:
   - Input 0: `x11grab :1` 1920×1080 @ 30 fps
   - Input 1: `pulse` sink `virtual_speaker` (audio)
   - Output A (always): HLS → `/tmp/hls/stream.m3u8` served by nginx on port 3000
   - Output B (optional): RTMP push to `${RTMP_URL}/${STREAM_KEY}` via `tee` muxer
10. Start nginx on port 3000
11. Monitor loop: kill container if Xvfb or FFmpeg dies

### `overlay.html` layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [transparent game area — 1430px wide]  │ [chat panel 490px]   │
│                                         │                       │
│   Factorio window shows through here    │   Chat (placeholder;  │
│   (pointer-events: none on overlay)     │   Twitch/Kick iframe  │
│                                         │   when CHAT_EMBED_URL)│
│                               ┌─────────┤                       │
│                               │ Avatar  │                       │
│                               │ iframe  │  localhost:12393/     │
│                               │         │    embed.html         │
└───────────────────────────────┴─────────┴───────────────────────┘
```

- Full-screen, `position: fixed`, `pointer-events: none`
- Purple starry background image behind everything (also set as desktop wallpaper)
- Avatar: `<iframe src="http://localhost:${AVATAR_PORT}/embed.html">` anchored bottom-right of the game area
- Chat panel: static placeholder by default; when `CHAT_EMBED_URL` env var is set, loads that URL as an iframe (e.g. Twitch chat embed)

### Key environment variables (new vs stream-client)

| Variable | Default | Purpose |
|----------|---------|---------|
| `RTMP_URL` | — | RTMP ingest URL (e.g. `rtmps://live.twitch.tv/app`); if unset, no RTMP push |
| `STREAM_KEY` | — | Platform stream key for RTMP |
| `ELEVENLABS_API_KEY` | — | ElevenLabs TTS API key |
| `ELEVENLABS_VOICE_ID` | `jqcCZkN6Knx8BJ5TBdYR` | ElevenLabs voice ID |
| `ANTHROPIC_API_KEY` | — | Claude API key for narration commentary |
| `CLAUDE_MODEL` | `claude-sonnet-4-20250514` | Model used for narration |
| `BROKER_URL` | `http://broker:8080` | Broker endpoint for step polling |
| `RUN_ID` | — | Which run to narrate |
| `AVATAR_PORT` | `12393` | Open-LLM-VTuber server port |
| `CHAT_EMBED_URL` | — | Optional iframe URL for chat panel (e.g. Twitch embed) |
| `DISPLAY_WIDTH` | `1920` | Virtual display width |
| `DISPLAY_HEIGHT` | `1080` | Virtual display height |
| `MIN_PAUSE` | `10` | Minimum seconds between narration beats |
| `MAX_PAUSE` | `30` | Maximum seconds between narration beats |

Shared vars (same as stream-client): `SERVER_HOST`, `SERVER_PORT`, `DISPLAY`, `TZ`.

### FFmpeg command (with optional RTMP)

**HLS only (no RTMP_URL):**
```bash
ffmpeg -loglevel warning \
  -f x11grab -framerate 30 -video_size 1920x1080 -draw_mouse 0 -i :1 \
  -f pulse -i virtual_speaker \
  -vcodec libx264 -preset ultrafast -tune zerolatency -pix_fmt yuv420p \
  -acodec aac -b:a 128k -ar 44100 \
  -g 60 -sc_threshold 0 \
  -f hls -hls_time 2 -hls_list_size 5 \
  -hls_flags delete_segments+append_list \
  -hls_segment_filename '/tmp/hls/seg%05d.ts' \
  /tmp/hls/stream.m3u8
```

**With RTMP push (RTMP_URL + STREAM_KEY set):**
```bash
ffmpeg -loglevel warning \
  -f x11grab -framerate 30 -video_size 1920x1080 -draw_mouse 0 -i :1 \
  -f pulse -i virtual_speaker \
  -vcodec libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
  -acodec aac -b:a 128k -ar 44100 \
  -g 60 -sc_threshold 0 \
  -f tee \
  "[select=v,a:f=hls:hls_time=2:hls_list_size=5:hls_flags=delete_segments+append_list:hls_segment_filename=/tmp/hls/seg%05d.ts]/tmp/hls/stream.m3u8|[select=v,a:f=flv]${RTMP_URL}/${STREAM_KEY}"
```

---

## Broker Changes

### `packages/broker/app/schemas.py`

Add `vtuber_stream_url` to `RunInfo`:

```python
class RunInfo(BaseModel):
    # ... existing fields ...
    vtuber_stream_url: Optional[str] = None
```

Add `StreamInfo` for the new `/api/streams` endpoint:

```python
class StreamInfo(BaseModel):
    run_id: str
    type: str                        # "replay" | "live"
    label: str                       # human-readable label
    stream_url: Optional[str]        # raw HLS (no avatar)
    vtuber_stream_url: Optional[str] # HLS with avatar + narration
    status: str
    model: str
    step_count: int
    final_score: Optional[float]
```

### `packages/broker/app/config.py`

Add:
```python
VTUBER_STREAM_CLIENT_IMAGE = os.getenv("VTUBER_STREAM_CLIENT_IMAGE", "claudetorio-vtuber-stream-client")
VTUBER_STREAM_BASE_PORT = int(os.getenv("VTUBER_STREAM_BASE_PORT", "5002"))
VTUBER_REPLAY_STREAM_BASE_PORT = int(os.getenv("VTUBER_REPLAY_STREAM_BASE_PORT", "6002"))
# Keys forwarded to vtuber containers
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "jqcCZkN6Knx8BJ5TBdYR")
```

Add helper methods:
```python
@classmethod
def get_vtuber_stream_url(cls, slot: int) -> str:
    """Public URL for the vtuber-stream-client for a replay slot."""
    parsed = urlparse(cls.STREAM_URL)
    scheme = parsed.scheme or "http"
    if cls.STREAM_DOMAIN:
        return f"{scheme}://cvr{slot}.{cls.STREAM_DOMAIN}/"
    host = cls.STREAM_PUBLIC_HOST or parsed.hostname or "localhost"
    return f"{scheme}://{host}:{cls.VTUBER_REPLAY_STREAM_BASE_PORT + slot}/"
```

### `packages/broker/app/state.py`

`active_replays` dict value shape extended:
```python
# key = run_id, value = {
#   "slot": int,
#   "stream_url": str,
#   "vtuber_stream_url": str | None,
#   "proc": asyncio.subprocess.Process | None,
# }
```

### `packages/broker/app/services/streaming.py`

Add `spawn_vtuber_stream_client(slot, factorio_host, run_id, rtmp_url=None, stream_key=None)`:

- Same shape as `spawn_stream_client` but uses `VTUBER_STREAM_CLIENT_IMAGE`
- Port: `VTUBER_STREAM_BASE_PORT + slot`
- Extra env vars: `BROKER_URL`, `RUN_ID`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `RTMP_URL` (if set), `STREAM_KEY` (if set)
- Container name: `vtuber-stream-client-{slot}`

### `packages/broker/app/services/replay.py`

Add `spawn_vtuber_replay_stream_client(run_id, slot, rtmp_url=None, stream_key=None) -> bool`:

- Like `spawn_replay_stream_client` but uses `spawn_vtuber_stream_client` internally
- Container name: `vtuber-stream-client-replay-{slot}`
- Port: `VTUBER_REPLAY_STREAM_BASE_PORT + slot`

Extend `stop_replay_containers` to also stop `vtuber-stream-client-replay-{slot}`.

### `packages/broker/app/routes/runs.py`

Extend `POST /api/runs/{run_id}/replay`:

```python
@router.post("/api/runs/{run_id}/replay", dependencies=[Depends(require_admin_key)])
async def start_replay(
    run_id: str,
    vtuber: bool = Query(True),           # default on
    rtmp_url: Optional[str] = Query(None),
    stream_key: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    app_state: AppState = Depends(get_app_state),
):
    ...
    vtuber_stream_url = None
    if vtuber:
        vtuber_ok = await spawn_vtuber_replay_stream_client(run_id, slot, rtmp_url, stream_key)
        if vtuber_ok:
            vtuber_stream_url = config.get_vtuber_stream_url(slot)

    app_state.active_replays[run_id] = {
        "slot": slot,
        "stream_url": stream_url,
        "vtuber_stream_url": vtuber_stream_url,
        "proc": None,
    }
    return {"run_id": run_id, "stream_url": stream_url, "vtuber_stream_url": vtuber_stream_url}
```

Update `RunInfo` construction in `list_runs` and `get_run` to include `vtuber_stream_url`.

### `packages/broker/app/routes/streams.py` (new file)

```python
GET /api/streams
```

Returns all runs that currently have an active replay (i.e. a `stream_url` in `active_replays`), plus any runs with `status=completed` that have steps (for on-demand replay). Joins with step counts and final scores from DB.

Response shape: `List[StreamInfo]`

---

## Frontend Changes

### `packages/frontend/interfaces/run.ts`

Add `vtuber_stream_url` to `RunInfo`:
```typescript
export interface RunInfo {
  // ... existing fields ...
  vtuber_stream_url?: string | null;
}
```

Add `StreamInfo` interface:
```typescript
export interface StreamInfo {
  run_id: string;
  type: 'replay' | 'live';
  label: string;
  stream_url: string | null;
  vtuber_stream_url: string | null;
  status: string;
  model: string;
  step_count: number;
  final_score: number | null;
}
```

### `packages/frontend/services/api.ts`

Add:
```typescript
export async function fetchStreams(): Promise<StreamInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/api/streams`, { cache: 'no-store' });
    if (res.ok) return res.json();
    return [];
  } catch {
    return [];
  }
}
```

### `packages/frontend/app/api/streams/route.ts` (new)

Proxy to broker with admin key:
```typescript
import { NextResponse } from 'next/server';

const BROKER_URL = process.env.BROKER_URL || 'http://localhost:8080';
const BROKER_ADMIN_KEY = process.env.BROKER_ADMIN_KEY || '';

export async function GET() {
  const res = await fetch(`${BROKER_URL}/api/streams`, {
    headers: { 'X-Admin-Key': BROKER_ADMIN_KEY },
    cache: 'no-store',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

### New homepage components

**`packages/frontend/components/home/StreamsSection.tsx`**
- Fetches `GET /api/streams` on mount, polls every 30s
- Renders a horizontal grid of `StreamCard` components
- Shows "No active streams" placeholder when empty

**`packages/frontend/components/home/StreamCard.tsx`**
- Props: `stream: StreamInfo`
- Shows thumbnail (HLS video preview or static placeholder)
- Badge: `LIVE` (green) or `Replay` (purple)
- Title: `stream.label` (e.g. "v0.0.1 – claude-sonnet-4-5")
- Stat line: step count, final score
- Links to `/stream/${stream.run_id}`

**`packages/frontend/components/home/TournamentSection.tsx`**
- Countdown timer to a configurable target date (`NEXT_PUBLIC_TOURNAMENT_DATE` env var or hardcoded)
- Shows days / hours / minutes / seconds
- Static placeholder text for tournament rules

**`packages/frontend/components/home/BenchmarksSection.tsx`**
- Fetches `GET /api/runs?status=completed&limit=20`
- Renders a table of completed runs sorted by `final_score`
- Columns: Model, Steps, Score, Date, Actions (replay link)

### Updated homepage (`packages/frontend/app/page.tsx`)

Replace `<Dashboard />` with new layout:
```tsx
export default function Home() {
  return (
    <main>
      <StreamsSection />
      <TournamentSection />
      <BenchmarksSection />
    </main>
  );
}
```

### New stream viewer page (`packages/frontend/app/stream/[runId]/page.tsx`)

- Server component fetches run info, redirects to `/runs` if not found
- Client component `StreamViewer`:
  - Full-page HLS video player using hls.js
  - Loads `vtuber_stream_url` if available, falls back to `stream_url`
  - Toolbar: run title, LIVE/Replay badge, model name, step count, score
  - Optional "Watch on Twitch" / "Watch on Kick" links (shown when `CHAT_EMBED_URL` contains platform domain)
  - Auto-polls run info every 10s to update metadata

---

## Port Conventions (additions)

| Resource | Formula | Default base |
|----------|---------|--------------|
| VTuber stream (live) | `VTUBER_STREAM_BASE_PORT + slot` | 5002 |
| VTuber stream (replay) | `VTUBER_REPLAY_STREAM_BASE_PORT + slot` | 6002 |

Caddy subdomain patterns (production, when `STREAM_DOMAIN` is set):
- `cv{slot}.{STREAM_DOMAIN}` — live VTuber stream
- `cvr{slot}.{STREAM_DOMAIN}` — replay VTuber stream

---

## `dev/docker-compose.yml` Changes

### New `vtuber-stream-client` build target

```yaml
vtuber-stream-client:
  build:
    context: ../packages/vtuber-stream-client
  image: claudetorio-vtuber-stream-client
  platform: linux/amd64
  entrypoint: ["sh", "-c", "echo 'vtuber-stream-client image ready'"]
  restart: "no"
```

### Broker env additions

```yaml
- VTUBER_STREAM_CLIENT_IMAGE=claudetorio-vtuber-stream-client
- VTUBER_STREAM_BASE_PORT=5002
- VTUBER_REPLAY_STREAM_BASE_PORT=6002
- ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY:-}
- ELEVENLABS_VOICE_ID=${ELEVENLABS_VOICE_ID:-jqcCZkN6Knx8BJ5TBdYR}
```

(`ANTHROPIC_API_KEY` is already passed through in the existing compose.)

---

## Deployment Changes

### `machines/stream-server/`

- Build and deploy `vtuber-stream-client` image alongside `stream-client`
- Open-LLM-VTuber runs embedded inside the container (no sidecar needed; it listens on 127.0.0.1:12393 inside the container)
- Caddy routing: add `cvr{slot}.{STREAM_DOMAIN}` → `vtuber-stream-client-replay-{slot}:3000` and `cv{slot}.{STREAM_DOMAIN}` → `vtuber-stream-client-{slot}:3000`
- Requires wildcard TLS cert already configured for `*.{STREAM_DOMAIN}`

### GitHub Actions (`.github/workflows/deploy.yml`)

- Add `packages/vtuber-stream-client/**` to stream-server deploy trigger
- Stream-server deploy script should build and push the new image

---

## `narrate.py` Adaptation for Replay Context

Source: `claudetorio-pump-stream/narrate.py` (579 lines).

Key changes from pump-stream version:
- `BROKER_URL` and `RUN_ID` come from container env vars (same as pump-stream)
- Commentary tone adjustment: add "replay" framing to SYSTEM_PROMPT — the AI is narrating *its past run* as a VTuber watching a replay, not playing live
- Intro prompt uses run metadata (model name, max steps, final score) fetched from `GET /api/runs/{RUN_ID}`
- All other logic (mood system, pacing, ElevenLabs TTS via speak.py, memory window, milestone detection) stays the same

Intro prompt adjustment:
```python
intro_msg = (
    f"You're a VTuber watching a replay of your past Factorio run. "
    f"Run: {run_info['model']}, {run_info['max_steps']} steps, "
    f"final score: {run_info.get('final_score', 'unknown')}. "
    f"Here's where things stood at step {last_step_idx}:\n\n{intro_summary}\n\n"
    f"Greet the stream and react to seeing your past self play. 2-3 sentences."
)
```

---

## Verification Checklist

1. **Build:** `docker compose -f dev/docker-compose.yml build vtuber-stream-client` completes without error
2. **Replay with VTuber:** `POST /api/runs/{id}/replay?vtuber=true` returns `{"stream_url": "...", "vtuber_stream_url": "..."}`
3. **HLS stream:** Open `{vtuber_stream_url}` in browser — composite stream shows (game + avatar + chat panel)
4. **Audio narration:** Stream has audio; VTuber avatar animates with lip sync
5. **RTMP push:** Set `RTMP_URL`/`STREAM_KEY` env vars; verify FFmpeg pushes to Twitch test ingest (`rtmps://live.twitch.tv/app/live_...`)
6. **Homepage STREAMS section:** `GET /` shows stream cards linking to `/stream/{runId}`
7. **Stream viewer:** `/stream/{runId}` loads and plays HLS stream
8. **`GET /api/streams`:** Returns JSON list of active/available streams
9. **Teardown:** `DELETE /api/runs/{id}/replay` stops `vtuber-stream-client-replay-{slot}`, `stream-client-replay-{slot}`, `stream-worker-{run_id}`, and `factorio-replay-{run_id}`
