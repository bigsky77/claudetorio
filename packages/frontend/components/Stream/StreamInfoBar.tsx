import type { StreamDefinition } from '@/lib/streams';

export default function StreamInfoBar({ stream }: { stream: StreamDefinition }) {
  const badgeColor = (stream.type === 'live' || stream.type === 'twitch-live') ? 'bg-accent-green' : 'bg-accent-blue';

  return (
    <div className="bg-surface-1 border border-t-0 border-surface-3 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className={`${badgeColor} text-black text-xs font-bold px-2 py-0.5 uppercase`}>
          {stream.label}
        </span>
        <span className="text-white/90 font-[family-name:var(--font-heading)] font-semibold text-sm">
          {stream.subtitle}
        </span>
      </div>

      <div className="flex items-center gap-5 text-white/50 font-[family-name:var(--font-body)] text-xs">
        {/* TODO: replace with real viewer count */}
        <span>42 viewers</span>
        <span>&bull;</span>
        {/* TODO: replace with real avatar/model info */}
        <span>Mao (VTuber)</span>
        <span>&bull;</span>
        <span>claude-sonnet-4-5</span>
      </div>
    </div>
  );
}
