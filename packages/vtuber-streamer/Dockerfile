FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# System deps: Xvfb, PulseAudio, FFmpeg, Chrome, nginx, Python, envsubst, curl, git
RUN apt-get update && apt-get install -y \
    xvfb \
    x11-utils \
    pulseaudio \
    ffmpeg \
    nginx \
    wget \
    gnupg2 \
    curl \
    git \
    python3 \
    python3-venv \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Google Chrome
RUN wget -q -O - https://dl.google.com/linux/linux_signing_key.pub \
      | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] \
       http://dl.google.com/linux/chrome/deb/ stable main" \
       > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Clone Open-LLM-VTuber avatar server and install its dependencies into a venv.
# AVATAR_REPO can be overridden at build time for forks/mirrors.
ARG AVATAR_REPO=https://github.com/Open-LLM-VTuber/Open-LLM-VTuber.git
RUN git clone --depth 1 "${AVATAR_REPO}" /app/claudetorio-stream-avatar \
    && cd /app/claudetorio-stream-avatar \
    && python3 -m venv .venv \
    && .venv/bin/pip install --no-cache-dir uv \
    && (.venv/bin/uv sync --frozen 2>/dev/null \
        || .venv/bin/pip install --no-cache-dir -r requirements.txt 2>/dev/null \
        || true)

# Pre-download and extract the sherpa-onnx ASR model so the avatar server starts
# immediately at runtime without downloading 999 MB on first launch.
RUN cd /app/claudetorio-stream-avatar \
    && mkdir -p models \
    && wget -q --show-progress \
       -O models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2 \
       "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2" \
    && cd models \
    && python3 -c "import tarfile; tarfile.open('sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2').extractall('.')" \
    && rm sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2

RUN mkdir -p /tmp/hls

COPY nginx.conf /etc/nginx/nginx.conf
COPY static/ /app/static/
COPY entrypoint.sh narrate.py speak.py wrapper.html ./
RUN chmod +x entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
