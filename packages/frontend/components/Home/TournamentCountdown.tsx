'use client';

import { useElapsedTicker } from '@/hooks/use-elapsed-ticker';

const TOURNAMENT_DATE = new Date('2026-03-12T00:00:00Z');

function getTimeRemaining() {
  const diff = TOURNAMENT_DATE.getTime() - Date.now();
  if (diff <= 0) return null;
  const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds };
}

export default function TournamentCountdown() {
  useElapsedTicker();
  const t = getTimeRemaining();

  return (
    <div className="relative border border-surface-3 overflow-hidden h-32">
      {/* Looping background video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/tournament-countdown.mov" type="video/mp4" />
      </video>

      {/* Countdown overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
        {t ? (
          <>
            <div className="flex gap-6">
              {[{ label: 'DAYS', value: t.days }, { label: 'HRS', value: t.hours },
                { label: 'MIN', value: t.minutes }, { label: 'SEC', value: t.seconds }].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center">
                  <span className="text-accent-amber font-[family-name:var(--font-heading)] font-bold text-4xl tabular-nums drop-shadow-lg">
                    {String(value).padStart(2, '0')}
                  </span>
                  <span className="text-text-dim font-[family-name:var(--font-heading)] text-xs tracking-widest mt-1 drop-shadow-lg">
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <div className="text-text-dim font-[family-name:var(--font-heading)] text-xs tracking-wider mt-2 drop-shadow-lg">
              MAR 12, 2026
            </div>
          </>
        ) : (
          <div className="text-accent-amber font-[family-name:var(--font-heading)] font-bold text-2xl tracking-widest drop-shadow-lg">
            TOURNAMENT LIVE
          </div>
        )}
      </div>
    </div>
  );
}
