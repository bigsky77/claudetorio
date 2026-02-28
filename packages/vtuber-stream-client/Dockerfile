FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Base system packages
RUN apt-get update && apt-get install -y \
    git \
    xvfb \
    x11-utils \
    pulseaudio \
    ffmpeg \
    wget \
    gnupg2 \
    curl \
    python3 \
    ca-certificates \
    gettext-base \
    # Mesa GL (llvmpipe) — software fallback if GPU is unavailable
    libgl1-mesa-dri \
    # Chrome dependencies
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libvulkan1 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome stable
RUN wget -q -O /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get update \
    && apt-get install -y /tmp/google-chrome.deb \
    && rm /tmp/google-chrome.deb \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Clone Open-LLM-VTuber at a pinned commit; recurse submodules for frontend/
# Commit 19b58b1 is post-v1.2.1 and adds elevenlabs_tts + cartesia_tts support
RUN git init /app/vtuber \
    && cd /app/vtuber \
    && git remote add origin https://github.com/Open-LLM-VTuber/Open-LLM-VTuber \
    && git fetch --depth 1 origin 19b58b1f6c01e082289fce089392997b9d14fbc4 \
    && git checkout FETCH_HEAD \
    && git submodule update --init --recursive

# Patch upstream frontend embed page with Claudetorio transparent/audio-safe overlay version
COPY patches/embed.html /app/vtuber/frontend/embed.html

# Install Python dependencies
RUN cd /app/vtuber && uv sync --frozen --no-dev

# Download hls.js for wrapper page (Chrome loads this to play the Factorio HLS stream)
RUN mkdir -p /var/www/html \
    && wget -q -O /var/www/html/hls.min.js \
       "https://cdn.jsdelivr.net/npm/hls.js@latest/dist/hls.min.js"

# Copy pre-downloaded ASR models (avoids slow download at container startup)
COPY models/ /app/vtuber/models/

# Copy configs and scripts
COPY conf.yaml.template /conf.yaml.template
COPY wrapper.html /wrapper.html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy narration scripts
COPY narrate.py /narrate.py
COPY speak.py /speak.py

CMD ["/entrypoint.sh"]
