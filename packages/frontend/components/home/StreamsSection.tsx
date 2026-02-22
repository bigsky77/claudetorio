'use client';

import { useEffect, useState } from 'react';
import StreamCard from './StreamCard';
import { fetchStreams } from '@/services/api';
import type { StreamInfo } from '@/interfaces';

export default function StreamsSection() {
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const data = await fetchStreams();
      if (mounted) {
        setStreams(data);
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
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
        Streams
      </h2>

      {loading ? (
        <div style={{ color: 'rgba(180, 160, 220, 0.4)', fontSize: 13 }}>
          Loading streams...
        </div>
      ) : streams.length === 0 ? (
        <div
          style={{
            padding: '24px 0',
            color: 'rgba(180, 160, 220, 0.35)',
            fontSize: 13,
          }}
        >
          No streams available. Start a run and replay it to see it here.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {streams.map((stream) => (
            <StreamCard key={stream.run_id} stream={stream} />
          ))}
        </div>
      )}
    </section>
  );
}
