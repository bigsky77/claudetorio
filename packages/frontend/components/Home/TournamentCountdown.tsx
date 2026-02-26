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
    <div className="bg-surface-1 border border-surface-3 p-6 flex flex-col items-center justify-center gap-2">
      {t ? (
        <>
          <div className="flex gap-6">
            {[{ label: 'DAYS', value: t.days }, { label: 'HRS', value: t.hours },
              { label: 'MIN', value: t.minutes }, { label: 'SEC', value: t.seconds }].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-accent-amber font-[family-name:var(--font-heading)] font-bold text-4xl tabular-nums">
                  {String(value).padStart(2, '0')}
                </span>
                <span className="text-text-dim font-[family-name:var(--font-heading)] text-xs tracking-widest mt-1">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <div className="text-text-dim font-[family-name:var(--font-heading)] text-xs tracking-wider mt-2">
            MAR 12, 2026
          </div>
        </>
      ) : (
        <div className="text-accent-amber font-[family-name:var(--font-heading)] font-bold text-2xl tracking-widest">
          TOURNAMENT LIVE
        </div>
      )}
    </div>
  );
}
