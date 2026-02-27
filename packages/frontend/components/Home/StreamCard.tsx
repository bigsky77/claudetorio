import Link from 'next/link';
import type { StreamDefinition } from '@/lib/streams';

export default function StreamCard({ stream }: { stream: StreamDefinition }) {
  const badgeColor = stream.type === 'live' ? 'bg-accent-green' : 'bg-accent-blue';

  return (
    <Link
      href={stream.type === 'live' ? '/live' : `/run/${stream.runId ?? stream.id}`}
      className="block bg-surface-1 border border-surface-3 hover:border-surface-3/80 transition-colors"
    >
      <div className="p-4">
        <span className={`${badgeColor} text-black text-xs font-bold px-2 py-1 uppercase`}>
          {stream.label}
        </span>
      </div>

      <div className="px-4">
        <div className="bg-surface-2 p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stream.thumbnailSrc}
            alt=""
            className="w-full aspect-video object-cover"
          />
        </div>
      </div>

      <div className="p-4">
        <div className="text-white/90 text-sm font-[family-name:var(--font-body)] font-medium">
          {stream.subtitle}
        </div>
      </div>
    </Link>
  );
}
