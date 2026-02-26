# VTuber Stream Client

This image builds the Claudetorio VTuber replay RTMP compositor container.

## Source of Truth

This image currently uses a clone-based build from upstream Open-LLM-VTuber:

- Dockerfile clones `Open-LLM-VTuber` `v1.2.1`

To preserve Claudetorio stream behavior, the build overrides:

- `frontend/embed.html` with `packages/vtuber-stream-client/patches/embed.html`

That patch file is copied from the working local setup in:

- `claudetorio-pump-stream/claudetorio-stream-avatar/frontend/embed.html`

## What This Container Does

At startup it:

1. Starts `Xvfb`
2. Starts PulseAudio with a null sink
3. Starts the cloned avatar server (`run_server.py`)
4. Serves a composite wrapper page on port `3000`
5. Launches Chrome in kiosk mode to render the composite
6. Captures X11 + PulseAudio with `ffmpeg` and streams to RTMP

The container writes `/tmp/streaming` after `ffmpeg` is confirmed alive; `stream-agent` uses this as the VTuber readiness signal.

## Required Environment Variables

- `FACTORIO_STREAM_URL`
- At least one of `TWITCH_STREAM_KEY` or `KICK_STREAM_KEY`
- `ANTHROPIC_API_KEY` (for the default `conf.yaml.template`)

Optional (template/provider dependent):

- `ELEVENLABS_API_KEY`

## Updating the Clone Patch

When bumping the upstream Open-LLM-VTuber tag/version:

1. Confirm upstream still serves `frontend/embed.html`
2. Re-validate `packages/vtuber-stream-client/patches/embed.html` against the new frontend assets/DOM
3. Rebuild `claudetorio-vtuber-stream-client`
4. Smoke test transparency + audio unlock in stream output

If the upstream frontend asset names or DOM structure change, the embed patch may need to be refreshed.
