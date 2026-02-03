# Factorio streaming client container using LinuxServer's KasmVNC base
# Connects to an existing Factorio server and streams the view via web browser

FROM ghcr.io/linuxserver/baseimage-kasmvnc:ubuntunoble

# Install dependencies for Factorio
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    xz-utils \
    ca-certificates \
    libxrandr2 \
    libxcursor1 \
    libxinerama1 \
    libxi6 \
    libgl1 \
    libasound2t64 \
    && rm -rf /var/lib/apt/lists/*

# Create factorio directories
RUN mkdir -p /opt/factorio /config/factorio-data

# Copy startup configuration
COPY root/ /

# Copy our scripts
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh

# Copy custom init scripts to start Factorio automatically
COPY custom-cont-init.d/ /custom-cont-init.d/
RUN chmod +x /custom-cont-init.d/*

# Environment variables for KasmVNC
# NOTE: Do NOT set PASSWORD here - it triggers nginx basic auth
# To enable auth, set PASSWORD in docker-compose instead
ENV \
    TITLE="Factorio Stream" \
    DISPLAY_WIDTH=1280 \
    DISPLAY_HEIGHT=720 \
    DISPLAY_REFRESH_RATE=30 \
    CUSTOM_USER=viewer

# Server to connect to (override in docker-compose)
ENV \
    SERVER_HOST=localhost \
    SERVER_PORT=34197

# KasmVNC web interface
EXPOSE 3000

# The base image handles everything else - it will run /defaults/autostart
