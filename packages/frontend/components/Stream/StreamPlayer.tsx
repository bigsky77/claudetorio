'use client';

import type { StreamDefinition } from '@/lib/streams';
import { resolveStreamSource } from '@/lib/streams';

export default function StreamPlayer({ stream }: { stream: StreamDefinition }) {
  const source = resolveStreamSource(stream);

  return (
    <div className="border-[10px] border-[#2aa6a6] bg-black/20 overflow-hidden">
      <div className="aspect-video w-full">
        {!source ? (
          <div className="w-full h-full flex items-center justify-center text-white/70">
            Stream source not configured. Check NEXT_PUBLIC_STREAM_URL.
          </div>
        ) : source.kind === 'iframe' ? (
          <iframe
            src={source.src}
            className="w-full h-full"
            allowFullScreen
            // TODO: if iframe embedding is blocked by headers, fall back to opening in a new tab
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
