'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import type { StreamDefinition } from '@/lib/streams';
import { resolveStreamSource } from '@/lib/streams';

function HlsPlayer({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const manifestUrl = src.replace(/\/$/, '') + '/stream.m3u8';
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({ liveSyncDurationCount: 3, maxBufferLength: 10 });
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestUrl;
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
    }

    return () => { hls?.destroy(); };
  }, [src]);

  return <video ref={videoRef} className={className} autoPlay muted playsInline controls />;
}

export default function StreamPlayer({ stream }: { stream: StreamDefinition }) {
  const source = resolveStreamSource(stream);

  return (
    <div className="bg-surface-2 border border-surface-3 overflow-hidden">
      <div className="aspect-video w-full">
        {!source ? (
          <div className="w-full h-full flex items-center justify-center text-white/40 font-[family-name:var(--font-body)] text-sm">
            No stream available yet. Waiting for video feed...
          </div>
        ) : source.kind === 'hls' ? (
          <HlsPlayer src={source.src} className="w-full h-full bg-black object-contain" />
        ) : source.kind === 'iframe' ? (
          <iframe
            src={source.src}
            className="w-full h-full"
            allowFullScreen
          />
        ) : (
          <video
            src={source.src}
            className="w-full h-full bg-black object-contain"
            controls
            autoPlay
          />
        )}
      </div>
    </div>
  );
}
