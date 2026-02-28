FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    x11-utils \
    mesa-utils \
    libgl1-mesa-dri \
    libvulkan1 \
    libgbm1 \
    libdrm2 \
    wget \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome stable
RUN wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get update \
    && apt-get install -y /tmp/chrome.deb \
    && rm /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
COPY test.html /test.html
RUN chmod +x /entrypoint.sh

EXPOSE 5901 6080

ENTRYPOINT ["/entrypoint.sh"]
