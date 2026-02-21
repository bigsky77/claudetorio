FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# universe repo required for ffmpeg with libx264 on Ubuntu 22.04
RUN apt-get update && apt-get install -y --no-install-recommends software-properties-common \
    && add-apt-repository universe \
    && apt-get update && apt-get install -y --no-install-recommends \
        xvfb openbox x11-utils \
        ffmpeg \
        nginx \
        libxrandr2 libxcursor1 libxinerama1 libxi6 libgl1 libasound2 \
        wget xz-utils ca-certificates curl procps \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/factorio /tmp/hls /tmp/factorio-data /tmp/factorio-client \
             /var/log/nginx /var/lib/nginx /run/nginx

COPY scripts/start-factorio.sh /scripts/start-factorio.sh
COPY entrypoint.sh /entrypoint.sh
COPY nginx.conf /etc/nginx/nginx.conf
COPY index.html /var/www/hls/index.html

RUN chmod +x /scripts/start-factorio.sh /entrypoint.sh

ENV DISPLAY=:1 \
    DISPLAY_WIDTH=1280 \
    DISPLAY_HEIGHT=720 \
    SERVER_HOST=localhost \
    SERVER_PORT=34197

EXPOSE 3000
CMD ["/entrypoint.sh"]
