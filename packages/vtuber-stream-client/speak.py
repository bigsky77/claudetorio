#!/usr/bin/env python3
"""Generate speech via ElevenLabs and play it through the virtual audio sink for streaming."""

import json
import os
import subprocess
import sys
import tempfile
import urllib.request

ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY", "")
ELEVENLABS_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "jqcCZkN6Knx8BJ5TBdYR")
MODEL_ID = "eleven_multilingual_v2"


def generate_speech(text: str) -> bytes:
    """Call ElevenLabs API to generate speech audio."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}"
    payload = json.dumps(
        {
            "text": text,
            "model_id": MODEL_ID,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.5,
                "style": 0.0,
                "use_speaker_boost": True,
            },
        }
    ).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )

    print("Generating speech via ElevenLabs...")
    with urllib.request.urlopen(req) as resp:
        audio = resp.read()
    print(f"  Got {len(audio)} bytes of audio")
    return audio


def play_audio(audio_bytes: bytes):
    """Play audio through PulseAudio virtual sink so ffmpeg captures it for stream."""
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        f.write(audio_bytes)
        tmp_path = f.name

    try:
        print(f"Playing audio through virtual sink...")
        # Use ffmpeg to decode mp3 and output to pulse
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "warning",
                "-i",
                tmp_path,
                "-af",
                "volume=0.75",
                "-f",
                "pulse",
                "-device",
                "virtual_speaker",
                "default",
            ],
            check=True,
        )
        print("  Playback complete.")
    finally:
        os.unlink(tmp_path)


def main():
    if len(sys.argv) > 1:
        text = " ".join(sys.argv[1:])
    else:
        text = (
            "AI agents are getting good at complex, long-horizon reasoning tasks. "
            "But how do you actually see them think? How do you evaluate reasoning "
            "that unfolds over hours or days? "
            "Factorio is the answer. It's a game about building automated factories. "
            "Logistics, optimization, scaling, debugging. The kind of messy, compound "
            "problem-solving that separates real intelligence from pattern matching."
        )

    audio = generate_speech(text)
    play_audio(audio)


if __name__ == "__main__":
    main()
