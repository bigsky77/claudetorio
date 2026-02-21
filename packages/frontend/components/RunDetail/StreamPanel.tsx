'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

function HlsVideo({ streamUrl, className }: { streamUrl: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const manifestUrl = streamUrl.replace(/\/$/, '') + '/stream.m3u8';
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({ liveSyncDurationCount: 3, maxBufferLength: 20 });
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestUrl;
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
    }

    return () => { hls?.destroy(); };
  }, [streamUrl]);

  return <video ref={videoRef} className={className} autoPlay muted playsInline />;
}

export default function StreamPanel({
  streamUrl,
  mode = 'embedded',
}: {
  streamUrl: string;
  mode?: 'embedded' | 'background';
}) {
  if (mode === 'background') {
    return (
      <div className="absolute inset-0">
        <HlsVideo streamUrl={streamUrl} className="w-full h-full object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
      </div>
    );
  }
  return (
    <div className="aspect-video bg-black rounded-lg overflow-hidden border border-gray-700">
      <HlsVideo streamUrl={streamUrl} className="w-full h-full object-contain" />
    </div>
  );
}
