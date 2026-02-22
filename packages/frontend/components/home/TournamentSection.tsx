'use client';

import { useEffect, useState } from 'react';

// Set NEXT_PUBLIC_TOURNAMENT_DATE to override (ISO 8601 format)
const TARGET_DATE = new Date(
  process.env.NEXT_PUBLIC_TOURNAMENT_DATE || '2026-04-01T00:00:00Z'
);

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function TournamentSection() {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    function tick() {
      const now = Date.now();
      const diff = TARGET_DATE.getTime() - now;
      if (diff <= 0) {
        setEnded(true);
        return;
      }
      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);
      setTimeLeft({ days, hours, minutes, seconds });
    }
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section style={{ marginBottom: 48 }}>
      <h2
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(160, 130, 230, 0.7)',
          marginBottom: 16,
        }}
      >
        Tournament
      </h2>

      <div
        style={{
          background: '#0f0d1e',
          border: '1px solid rgba(120, 80, 200, 0.3)',
          borderRadius: 8,
          padding: '24px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}
      >
        {ended ? (
          <div style={{ fontSize: 20, fontWeight: 700, color: '#c8a8f0' }}>
            Tournament is live!
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'rgba(180, 160, 220, 0.5)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Next tournament starts in
            </div>
            <div
              style={{
                display: 'flex',
                gap: 24,
                alignItems: 'baseline',
                marginTop: 4,
              }}
            >
              {[
                { value: timeLeft.days, label: 'days' },
                { value: timeLeft.hours, label: 'hrs' },
                { value: timeLeft.minutes, label: 'min' },
                { value: timeLeft.seconds, label: 'sec' },
              ].map(({ value, label }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#e0d0ff', lineHeight: 1 }}>
                    {pad(value)}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(180, 160, 220, 0.45)', marginTop: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
