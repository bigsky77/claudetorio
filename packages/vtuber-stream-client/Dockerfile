FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# universe repo required for ffmpeg with libx264 on Ubuntu 22.04
RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common \
    && add-apt-repository universe \
    && apt-get update && apt-get install -y --no-install-recommends \
        xvfb openbox x11-utils feh \
        ffmpeg \
        nginx \
        pulseaudio pulseaudio-utils \
        libxrandr2 libxcursor1 libxinerama1 libxi6 libgl1 libasound2 \
        wget xz-utils ca-certificates curl procps gnupg \
        xdotool \
        python3.11 python3.11-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Google Chrome (for overlay.html kiosk rendering)
RUN curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
        | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] \
        http://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# uv for Python dependency management
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

RUN mkdir -p /opt/factorio /tmp/hls /tmp/.X11-unix /tmp/factorio-data /tmp/factorio-client \
             /var/log/nginx /var/lib/nginx /run/nginx /var/www/hls /var/www/overlay /app

RUN python3.11 -c "import struct,zlib; c=lambda t,d:struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff); w,h=1920,1080; raw=b''.join(b'\x00'+bytes([13,8,32]*w) for _ in range(h)); open('/background.png','wb').write(b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+c(b'IDAT',zlib.compress(raw))+c(b'IEND',b''))"

COPY scripts/start-factorio.sh /scripts/start-factorio.sh
COPY entrypoint.sh /entrypoint.sh
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /var/www/hls/index.html
COPY overlay.html /var/www/overlay/overlay.html
COPY narrate.py /app/narrate.py
COPY speak.py /app/speak.py

RUN chmod +x /scripts/start-factorio.sh /entrypoint.sh

ENV DISPLAY=:1 \
    DISPLAY_WIDTH=1920 \
    DISPLAY_HEIGHT=1080 \
    SERVER_HOST=localhost \
    SERVER_PORT=34197 \
    AVATAR_PORT=12393 \
    BROKER_URL=http://broker:8080 \
    RUN_ID="" \
    ANTHROPIC_API_KEY="" \
    ELEVENLABS_API_KEY="" \
    ELEVENLABS_VOICE_ID="jqcCZkN6Knx8BJ5TBdYR" \
    CLAUDE_MODEL="claude-sonnet-4-20250514" \
    MIN_PAUSE=10 \
    MAX_PAUSE=30 \
    RTMP_URL="" \
    STREAM_KEY="" \
    CHAT_EMBED_URL=""

EXPOSE 3000
CMD ["/entrypoint.sh"]
