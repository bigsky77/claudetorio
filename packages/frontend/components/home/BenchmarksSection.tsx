'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { RunInfo } from '@/interfaces';
import { API_BASE } from '@/constants';

export default function BenchmarksSection() {
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/runs?status=completed&limit=20`, { cache: 'no-store' });
        if (res.ok && mounted) {
          const data: RunInfo[] = await res.json();
          // Sort by final_score descending
          data.sort((a, b) => (b.final_score ?? 0) - (a.final_score ?? 0));
          setRuns(data);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const maxScore = runs.length > 0 ? Math.max(...runs.map((r) => r.final_score ?? 0)) : 1;

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
        Benchmarks
      </h2>

      <div
        style={{
          background: '#0f0d1e',
          border: '1px solid rgba(120, 80, 200, 0.3)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: 24, color: 'rgba(180, 160, 220, 0.4)', fontSize: 13 }}>
            Loading benchmarks...
          </div>
        ) : runs.length === 0 ? (
          <div style={{ padding: 24, color: 'rgba(180, 160, 220, 0.35)', fontSize: 13 }}>
            No completed runs yet.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(120, 80, 200, 0.25)' }}>
                {['#', 'Model', 'Steps', 'Score', 'Progress', 'Date', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'rgba(160, 130, 230, 0.55)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((run, idx) => {
                const score = run.final_score ?? 0;
                const pct = maxScore > 0 ? (score / maxScore) * 100 : 0;
                const modelShort = run.model.split('/').pop() ?? run.model;
                const date = run.ended_at
                  ? new Date(run.ended_at).toLocaleDateString()
                  : '—';
                return (
                  <tr
                    key={run.run_id}
                    style={{
                      borderBottom: '1px solid rgba(120, 80, 200, 0.12)',
                    }}
                  >
                    <td style={{ padding: '10px 16px', color: 'rgba(180, 160, 220, 0.4)', width: 40 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#e0d0ff' }}>
                      {modelShort}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'rgba(180, 160, 220, 0.6)' }}>
                      {run.step_count}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#c8a8f0', fontWeight: 600 }}>
                      {score.toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 16px', width: 160 }}>
                      <div
                        style={{
                          height: 6,
                          background: 'rgba(80, 50, 140, 0.3)',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            height: '100%',
                            width: `${pct}%`,
                            background: 'linear-gradient(90deg, #7040c8 0%, #c080ff 100%)',
                            borderRadius: 3,
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'rgba(180, 160, 220, 0.4)', fontSize: 12 }}>
                      {date}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <Link
                        href={`/stream/${run.run_id}`}
                        style={{
                          fontSize: 11,
                          color: '#9060d0',
                          textDecoration: 'none',
                          padding: '3px 8px',
                          border: '1px solid rgba(120, 80, 200, 0.4)',
                          borderRadius: 4,
                        }}
                      >
                        Replay ▶
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
