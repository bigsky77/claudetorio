# VTuber Streamer Architecture

**Feature:** A VTuber-hosted broadcast of a Factorio AI replay, streamed live to Twitch or Kick, with the stream embedded on claudetorio's home page.

---

## 1. Overview

When a run replay is active, an operator can optionally launch a `vtuber-streamer` container alongside it. The container:

1. Starts a local HTTP server serving a composed scene (game iframe + avatar iframe)
2. Opens the scene in a headless Chrome browser on a virtual display
3. Polls the broker for each new replayed step; generates AI first-person commentary via Claude
4. Sends commentary text to the avatar server (`POST /api/speak`), which drives TTS + lip-sync
5. Encodes the composed scene (game + avatar + audio) and streams it to Twitch or Kick via RTMP
6. Reports its stream channel back to the broker so the home page can embed it

The implementation is a dockerized, replay-aware port of `claudetorio-pump-stream`, which proved out the full Xvfb → Chrome → avatar → FFmpeg → RTMPS pipeline.

### What `claudetorio-stream-avatar` does

`claudetorio-stream-avatar` is a fork of Open-LLM-VTuber. It runs an HTTP server on `:12393` that exposes:

- `GET /embed.html` — the Live2D avatar rendered in-browser via WebGL + `sherpa-onnx` for on-device TTS and lip-sync timing
- `POST /api/speak` — accepts `{"text": "..."}` JSON; the server synthesizes speech (via sherpa-onnx or a configured ElevenLabs backend), plays it through PulseAudio, and drives the avatar's lip-sync from the audio envelope

`speak.py` (copied from pump-stream) is a **standalone utility** for testing ElevenLabs TTS → PulseAudio playback outside the avatar server. It is _not_ called by `narrate.py`. All production TTS + lip-sync goes through the avatar server's `/api/speak`.

> **Open question:** Confirm whether the `claudetorio-stream-avatar` fork uses sherpa-onnx TTS or calls ElevenLabs internally. If sherpa-onnx, the `ELEVENLABS_API_KEY` env var is unused in normal operation and can be dropped from the required list. If the fork supports ElevenLabs as a TTS backend, document the relevant config key inside the avatar server.

---

## 2. System Overview

```
game-server
  ├─ factorio-replay-{run_id}          ← headless Factorio (unchanged)
  ├─ stream-client-replay-{run_id}     ← HLS feed at :4002+slot (unchanged)
  ├─ stream-worker-{run_id}            ← RCON step replay (unchanged)
  └─ vtuber-streamer-{run_id}          ← NEW
       ├─ Xvfb :99                      virtual display
       ├─ PulseAudio (null sink)         virtual audio device
       ├─ claudetorio-stream-avatar      Live2D avatar HTTP server on :12393
       ├─ python3 -m http.server :8080   serves /tmp/wrapper.html
       ├─ Chrome (wrapper.html)          composites game iframe + avatar iframe
       ├─ FFmpeg                         x11grab + PulseAudio → RTMPS → Twitch/Kick
       └─ narrate.py                     polls broker steps → Claude → POST /api/speak

stream-server
  └─ stream-client-replay-{run_id}     ← if STREAM_AGENT_URL is set (prod only)

Twitch / Kick
  └─ RTMPS ingest                      final destination of RTMP stream

claudetorio frontend (browser)
  └─ Dashboard                         embeds Twitch/Kick player iframe when active
```

---

## 3. Container: `vtuber-streamer`

### 3.1 Package layout

```
packages/vtuber-streamer/
  Dockerfile          Ubuntu base; Chrome, FFmpeg, Xvfb, PulseAudio, Python deps;
                      clones claudetorio-stream-avatar during build
  entrypoint.sh       Startup sequence (see §3.3)
  narrate.py          Commentary loop (adapted from claudetorio-pump-stream)
  speak.py            Standalone ElevenLabs TTS + PulseAudio utility (copied from pump-stream;
                      NOT called by narrate.py — for manual testing only)
  wrapper.html        HTML page with game iframe + avatar iframe (template; envsubst fills URL)
  requirements.txt    anthropic, httpx, python-dotenv
```

### 3.2 wrapper.html

Chrome opens this page (served locally at `http://localhost:8080/wrapper.html`) fullscreen on the virtual display. `entrypoint.sh` substitutes `${GAME_STREAM_URL}` before the server starts.

```html
<style>
  body { margin: 0; background: #000; overflow: hidden; }
  #game  { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; border: 0; }
  #avatar {
    position: absolute; bottom: 20px; right: 20px; z-index: 10;
    width: 420px; height: 420px; border: 0; pointer-events: none;
    background: transparent;
  }
</style>
<iframe id="game"   src="${GAME_STREAM_URL}"></iframe>
<iframe id="avatar" src="http://localhost:12393/embed.html" allowtransparency="true"></iframe>
```

`${GAME_STREAM_URL}` is substituted by `entrypoint.sh` via `envsubst`. The stream-client-replay's nginx already serves an hls.js player at `/`, so the game iframe loads the existing player page, not a raw `.m3u8` URL.

**Why a local HTTP server instead of `file://`:** Chrome blocks cross-origin requests from `file://` pages, which would prevent the game iframe from loading. Serving via `http://localhost:8080` avoids this with no extra Chrome flags.

### 3.3 entrypoint.sh startup sequence

```
1.  Start Xvfb (:${DISPLAY_NUM})                 virtual display 1920x1080x24
2.  Poll xdpyinfo until X is ready               (same pattern as stream-client)
3.  Start PulseAudio daemon
4.  Load null-sink: virtual_speaker              all audio routed here
5.  Set LD_LIBRARY_PATH for sherpa-onnx          (native C++ libs inside avatar server)
6.  Start claudetorio-stream-avatar              python run_server.py on :12393
7.  Poll GET http://localhost:12393/             wait up to 60 s
8.  envsubst wrapper.html → /tmp/wrapper.html
9.  python3 -m http.server 8080 --directory /tmp  serves wrapper.html at localhost:8080
10. Launch Chrome                                see §3.4; opens http://localhost:8080/wrapper.html
11. sleep 8                                      wait for Factorio client to render in iframe
12. Start FFmpeg                                 see §3.5
13. exec narrate.py                              foreground; container exits when narrate exits
```

### 3.4 Chrome launch flags

```bash
chrome \
  --display=:${DISPLAY_NUM} \
  --no-sandbox \
  --disable-dev-shm-usage \
  --use-gl=angle \
  --use-angle=swiftshader \
  --enable-webgl \
  --ignore-gpu-blocklist \
  --ozone-platform=x11 \
  --start-fullscreen \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  --use-fake-device-for-media-stream \
  --disable-infobars \
  --disable-extensions \
  --disable-translate \
  --no-first-run \
  --no-default-browser-check \
  --window-size=1920,1080 \
  --window-position=0,0 \
  --user-data-dir=/tmp/chrome-stream-profile \
  http://localhost:8080/wrapper.html
```

Key flags for Docker/headless:
- `--no-sandbox`, `--disable-dev-shm-usage` — required in containers
- `--use-gl=angle --use-angle=swiftshader` — software GL, no GPU needed
- `--ozone-platform=x11` — X11 backend for Xvfb
- `--kiosk` — permanent fullscreen, no UI chrome
- `--autoplay-policy=no-user-gesture-required` — auto-play video/audio

### 3.5 FFmpeg pipeline

```bash
ffmpeg -hide_banner -loglevel warning \
  -f x11grab -video_size 1920x1080 -framerate 30 -i :${DISPLAY_NUM}.0 \
  -f pulse -i virtual_speaker.monitor \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -b:v ${VIDEO_BITRATE} -maxrate ${VIDEO_BITRATE} -bufsize $(double VIDEO_BITRATE) \
  -pix_fmt yuv420p -g 60 \
  -c:a aac -b:a 128k -ar 44100 \
  -f flv "${RTMP_URL}"
```

- **Video:** x11grab captures the entire virtual display; scene composition is done by the browser, not FFmpeg filter graphs.
- **Audio:** PulseAudio null sink captures avatar TTS audio (and any HLS audio Chrome routes to the same sink).
- **Output:** FLV/RTMP, compatible with Twitch (`rtmps://live.twitch.tv/app/{key}`) and Kick (`rtmp://fa723fc1b171.global-contribute.live-video.net/app/{key}`).

### 3.6 narrate.py (adapted from pump-stream)

**Commentary is triggered once per new step batch** — on each poll cycle that returns at least one new step, a single commentary is generated and spoken. After speaking, the loop sleeps for `random.uniform(MIN_PAUSE, MAX_PAUSE)` seconds (mood-driven) before the next poll.

#### Mood system

`NarrationState` tracks `consecutive_errors`, `score_history`, and `milestones_hit` to pick a mood:

| Priority | Mood | Condition |
|---|---|---|
| 1 | `frustrated` | 3+ consecutive errors, or error in this batch + 2+ streak |
| 2 | `hyped` | Just hit a 50-point milestone, or score rose >10 pts in last 3 steps |
| 3 | `thinking` | Score flat (max-min ≤ 2 in last 5 steps) |
| 4 | `philosophical` | 10% random chance |
| 5 | `chill` | Default (weighted: 50% chill, 30% thinking, 20% hyped) |

#### Pacing (seconds after speaking)

| Mood | MIN | MAX |
|---|---|---|
| hyped | 6 | 14 |
| frustrated | 5 | 12 |
| thinking | 12 | 25 |
| philosophical | 15 | 35 |
| chill | `MIN_PAUSE` | `MAX_PAUSE` |

#### Changes from pump-stream

| What changes | Detail |
|---|---|
| Step source | `GET {BROKER_URL}/api/runs/{RUN_ID}/steps?after_step_idx=N` — already exists in broker, **no auth required** (endpoint is public) |
| Step fields used | `step_idx`, `production_score`, `error_occurred`, `code`, `result` — same fields |
| Run status | `GET {BROKER_URL}/api/runs/{RUN_ID}` — unchanged |
| Avatar endpoint | `POST http://localhost:12393/api/speak` with `{"text": "..."}` JSON — unchanged |
| TARGET_URL → env | pump-stream takes a hardcoded URL; narrate.py in this container needs none (it only talks to broker) |

The mood system, Claude call, conversation history, system prompt, and pacing logic are reused verbatim from pump-stream.

Commentary model defaults to `claude-haiku-4-5-20251001` — fast and cheap for 1–3 sentence outputs. Override via `COMMENTARY_MODEL`.

### 3.7 Environment variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `RUN_ID` | ✓ | — | Which run to narrate |
| `BROKER_URL` | ✓ | — | Step polling + run status (internal Docker URL, e.g. `http://broker:8080`) |
| `GAME_STREAM_URL` | ✓ | — | HLS player URL from stream-client-replay (taken from `active_replays[run_id]["stream_url"]` by broker) |
| `RTMP_URL` | ✓ | — | Full RTMPS URL including stream key |
| `ANTHROPIC_API_KEY` | ✓ | — | Claude API key |
| `ELEVENLABS_API_KEY` | ✓* | — | TTS (* only required if avatar server uses ElevenLabs backend; see §1 open question) |
| `ELEVENLABS_VOICE_ID` | | `jqcCZkN6Knx8BJ5TBdYR` | Voice persona for speak.py standalone use |
| `COMMENTARY_MODEL` | | `claude-haiku-4-5-20251001` | LLM for narration |
| `DISPLAY_NUM` | | `99` | Xvfb display number |
| `RESOLUTION` | | `1920x1080` | Capture resolution |
| `VIDEO_BITRATE` | | `3000k` | H.264 bitrate |
| `MIN_PAUSE` | | `10` | Min seconds between narration lines (chill mood) |
| `MAX_PAUSE` | | `30` | Max seconds between narration lines (chill mood) |

`RTMP_URL` is the full ingest URL with stream key embedded (e.g. `rtmps://live.twitch.tv/app/live_123456_abcdefg`). It is never stored in the database and lives only in the container's environment.

For the frontend embed, the **channel name** is what matters, not the stream key. The operator passes `channel` separately (see §4.2).

---

## 4. Broker Changes

### 4.1 Config (`app/config.py`)

Add one new env var:

```python
VTUBER_STREAMER_IMAGE: str = ""   # e.g. "claudetorio/vtuber-streamer:latest"
```

Same pattern as `RUN_WORKER_IMAGE` and `STREAM_WORKER_IMAGE`.

### 4.2 State (`app/state.py`)

`active_replays[run_id]` gains two new optional keys:

```python
active_replays: dict[str, {
    "slot": int,
    "stream_url": str,                   # HLS URL (existing)
    "proc": asyncio.Process | None,      # stream-worker (existing)
    "vtuber_proc": asyncio.Process | None,   # NEW
    "vtuber_channel": str | None,            # NEW  e.g. "claudetorio"
    "vtuber_platform": str | None,           # NEW  "twitch" | "kick"
}]
```

### 4.3 New endpoints (`app/routes/runs.py`)

```
POST /api/runs/{run_id}/vtuber
  Auth: require_admin_key
  Body: {
    "rtmp_url":  "rtmps://live.twitch.tv/app/live_xxx",   // full URL with key
    "channel":   "claudetorio",                            // for frontend embed
    "platform":  "twitch"                                  // "twitch" | "kick"
  }
  → validates replay is active (run_id in active_replays)
  → validates replay has no running vtuber already
  → docker run vtuber-streamer-{run_id} (see §4.4 for full spawn command)
  → stores proc + channel + platform in active_replays[run_id]
  → schedules asyncio.create_task(_monitor_vtuber(run_id, proc, app_state))
  → returns { "status": "started", "channel": "claudetorio", "platform": "twitch" }

DELETE /api/runs/{run_id}/vtuber
  Auth: require_admin_key
  → docker stop vtuber-streamer-{run_id}
  → clears vtuber_proc / channel / platform from active_replays[run_id]
```

### 4.4 Container spawn (`services/vtuber.py`)

New service file following the pattern of `services/replay.py`:

```python
async def spawn_vtuber_container(
    run_id: str,
    game_stream_url: str,
    rtmp_url: str,
    anthropic_api_key: str,
    elevenlabs_api_key: str,
) -> asyncio.subprocess.Process:
    container_name = f"vtuber-streamer-{run_id}"
    cmd = ["docker", "run", "--rm", "--name", container_name]
    if config.DOCKER_NETWORK:
        cmd += ["--network", config.DOCKER_NETWORK]
    env_vars = {
        "RUN_ID": run_id,
        "BROKER_URL": "http://broker:8080",
        "GAME_STREAM_URL": game_stream_url,
        "RTMP_URL": rtmp_url,
        "ANTHROPIC_API_KEY": anthropic_api_key,
        "ELEVENLABS_API_KEY": elevenlabs_api_key,
    }
    for k, v in env_vars.items():
        cmd += ["-e", f"{k}={v}"]
    cmd += [config.VTUBER_STREAMER_IMAGE]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    return proc
```

`ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` are passed in the request body from the frontend (never stored in the DB — same pattern as `api_key` in `CreateRunRequest`).

### 4.5 `_monitor_vtuber` (new, in `routes/runs.py`)

A separate monitor task handles the case where the vtuber process dies before the replay ends (e.g., bad stream key, quota exceeded):

```python
async def _monitor_vtuber(run_id: str, proc: asyncio.subprocess.Process, app_state: AppState):
    await proc.communicate()
    print(f"[vtuber] vtuber-streamer-{run_id} exited (code {proc.returncode})", flush=True)
    replay = app_state.active_replays.get(run_id)
    if replay:
        replay["vtuber_proc"] = None
        replay["vtuber_channel"] = None
        replay["vtuber_platform"] = None
```

This task **does not** pop the replay entry — the replay continues independently.

### 4.6 `_monitor_replay` update

When the stream-worker exits, also stop any running vtuber container:

```python
async def _monitor_replay(run_id: str, proc: asyncio.subprocess.Process, app_state: AppState):
    stdout_bytes, _ = await proc.communicate()
    # ... existing logging ...
    replay = app_state.active_replays.pop(run_id, None)
    slot = replay["slot"] if replay else None
    # Stop vtuber if it is still running
    if replay and replay.get("vtuber_proc") and replay["vtuber_proc"].returncode is None:
        stop = await asyncio.create_subprocess_exec(
            "docker", "stop", "-t", "10", f"vtuber-streamer-{run_id}",
        )
        await stop.wait()
    await stop_replay_containers(run_id, slot)
```

### 4.7 `stop_replay_containers` update (`services/replay.py`)

Add the vtuber container to the stop list so it is also cleaned up when `DELETE /api/runs/{run_id}/replay` is called directly:

```python
async def stop_replay_containers(run_id: str, slot: int | None = None) -> None:
    for name in [
        f"vtuber-streamer-{run_id}",    # NEW
        f"stream-worker-{run_id}",
        f"factorio-replay-{run_id}",
    ]:
        await _stop_container(name)
    # ... rest unchanged ...
```

### 4.8 Schema changes (`app/schemas.py`)

**`RunInfo`** — add optional fields:
```python
vtuber_channel: Optional[str] = None   # e.g. "claudetorio"
vtuber_platform: Optional[str] = None  # "twitch" | "kick"
```

**`SystemStatus`** — add featured stream info:
```python
vtuber_channel: Optional[str] = None
vtuber_platform: Optional[str] = None
```

### 4.9 `RunInfo` population

Both `get_run` and `list_runs` already read from `active_replays`. Add the new fields in the same block:

```python
# in get_run and list_runs, where RunInfo is constructed:
vtuber_channel=replay.get("vtuber_channel") if replay else None,
vtuber_platform=replay.get("vtuber_platform") if replay else None,
```

**`GET /api/status`** — populate `vtuber_channel` / `vtuber_platform` from the first active replay that has a running VTuber (there is typically only one at a time).

---

## 5. Frontend Changes

### 5.1 Home page — Featured Stream

A new **Featured Stream** section is added above `LiveGamesGrid` in `Dashboard.tsx`. It is rendered only when `systemStatus.vtuber_channel` is set.

```tsx
// components/FeaturedStream.tsx
export function FeaturedStream({ channel, platform }: { channel: string; platform: string }) {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "claudetorio.ai";
  const src =
    platform === "twitch"
      ? `https://player.twitch.tv/?channel=${channel}&parent=${hostname}&autoplay=true`
      : `https://player.kick.com/${channel}?autoplay=true`;

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="animate-pulse w-2 h-2 rounded-full bg-red-500" />
        <span className="text-sm font-semibold uppercase tracking-wide">Live on {platform}</span>
      </div>
      <div className="aspect-video w-full rounded-lg overflow-hidden border border-zinc-700">
        <iframe src={src} className="w-full h-full" allow="autoplay; fullscreen" />
      </div>
    </section>
  );
}
```

`useDashboardData` already polls `GET /api/status`. Update the hook to consume `vtuber_channel` / `vtuber_platform` and pass them to Dashboard.

### 5.2 Run detail page

`RunInfo` gains `vtuber_channel` and `vtuber_platform`. In `RunDetailClient.tsx`, when a VTuber stream is active alongside the replay, a secondary iframe is shown alongside the existing `StreamPanel`. `RunHeader.tsx` gains **Start VTuber** / **Stop VTuber** buttons that call the new API proxy routes.

The **Start VTuber** button opens a modal (or inline form) collecting:
- `rtmp_url` — full RTMPS ingest URL with stream key
- `channel` — channel name for embed
- `platform` — "twitch" | "kick"
- `anthropic_api_key` — passed through to container (never stored)
- `elevenlabs_api_key` — passed through to container (never stored)

### 5.3 New API proxy routes

```
packages/frontend/app/api/runs/[runId]/vtuber/route.ts
  POST   → proxy to broker POST /api/runs/{runId}/vtuber  (passes body through)
  DELETE → proxy to broker DELETE /api/runs/{runId}/vtuber
```

Same pattern as the existing `replay/route.ts`.

---

## 6. Data Flow

```
Operator
  │
  └─ POST /api/runs/{run_id}/vtuber   (rtmp_url, channel, platform, api keys)
       │
       ▼
  broker
    ├─ reads active_replays[run_id]["stream_url"] → passes as GAME_STREAM_URL
    ├─ docker run vtuber-streamer-{run_id}
    │     ├─ Xvfb + Chrome renders: stream-client-replay HLS + avatar
    │     ├─ FFmpeg → RTMPS → Twitch/Kick
    │     └─ narrate.py loop:
    │           polls GET /api/runs/{run_id}/steps?after_step_idx=N  (no auth needed)
    │           → updates NarrationState (mood from error_occurred + production_score)
    │           → Claude Haiku → 1-3 sentence first-person commentary
    │           → POST http://localhost:12393/api/speak {"text": "..."}
    │           → avatar server: TTS + lip-sync → PulseAudio → FFmpeg audio
    │           → sleep MIN_PAUSE..MAX_PAUSE (mood-driven) → next poll
    │
    └─ active_replays[run_id]["vtuber_channel"] = "claudetorio"

Browser (home page)
  ├─ polls GET /api/status (every 5 s)
  │     returns { vtuber_channel: "claudetorio", vtuber_platform: "twitch", ... }
  └─ renders <FeaturedStream channel="claudetorio" platform="twitch" />
        → <iframe src="https://player.twitch.tv/?channel=claudetorio&parent=..." />
```

---

## 7. Deployment

### Docker image

The `vtuber-streamer` image is built on game-server alongside `run-worker` and `stream-worker`. It is not deployed to stream-server — video encoding happens on game-server and the stream goes directly to Twitch/Kick's ingest.

The `claudetorio-stream-avatar` repo must be accessible at build time. It is cloned via `git clone` in the Dockerfile using a deploy key secret, or vendored as a git submodule.

### GitHub Actions

Add `packages/vtuber-streamer/` to the `game-server` deploy trigger in `.github/workflows/deploy.yml` (same pattern as `run-worker` and `stream-worker`).

### Resource budget

| Resource | Estimate |
|---|---|
| CPU | ~2–3 cores (Chrome + FFmpeg encode + avatar server) |
| RAM | ~2 GB (Chrome ~800 MB, avatar server ~400 MB, FFmpeg ~200 MB) |
| Network out | ~3–4 Mbps sustained (3 Mbps video + audio + overhead) |
| GPU | None required — libx264 software encode at `veryfast` preset is sufficient |

One VTuber stream per game-server is the practical limit given the CPU budget. Since replays are ephemeral and VTuber streams are optional, this is not a constraint.

---

## 8. Open Questions

| Question | Status |
|---|---|
| **Avatar TTS backend** | Confirm whether `claudetorio-stream-avatar` uses sherpa-onnx or ElevenLabs internally. If sherpa-onnx, `ELEVENLABS_API_KEY` is optional/unused in normal operation. |
| **Stream key handling** | Passed in request body, held only in container env, never persisted — acceptable for now |
| **Twitch `parent` domain** | Frontend uses `window.location.hostname` dynamically — works for both prod (`claudetorio.ai`) and dev (`localhost`) without configuration |
| **Multiple simultaneous VTuber streams** | Architecture supports it; `SystemStatus.vtuber_channel` only exposes the first one. Could be extended to a list. |
| **Commentary language** | English only for now; `narrate.py` system prompt can be updated to add other languages |
| **Stream key rotation** | Out of scope — operator responsibility |
