'use client';

import Link from 'next/link';
import type { StreamInfo } from '@/interfaces';

interface StreamCardProps {
  stream: StreamInfo;
}

export default function StreamCard({ stream }: StreamCardProps) {
  const isLive = stream.type === 'replay' && (stream.stream_url || stream.vtuber_stream_url);
  const modelShort = stream.model.split('/').pop() ?? stream.model;

  return (
    <Link
      href={`/stream/${stream.run_id}`}
      className="stream-card"
      style={{
        display: 'block',
        width: 280,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#0f0d1e',
        border: '1px solid rgba(120, 80, 200, 0.3)',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'border-color 0.2s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(160, 110, 255, 0.7)';
        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(120, 80, 200, 0.3)';
        (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
      }}
    >
      {/* Thumbnail placeholder */}
      <div
        style={{
          width: '100%',
          height: 158,
          background: 'linear-gradient(135deg, #1a1040 0%, #0d0820 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Factorio-ish grid pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(80,50,140,0.15) 19px, rgba(80,50,140,0.15) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(80,50,140,0.15) 19px, rgba(80,50,140,0.15) 20px)',
          }}
        />
        <span style={{ fontSize: 40, position: 'relative' }}>🏭</span>

        {/* Badge */}
        {isLive && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: '#e74c3c',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 3,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            LIVE REPLAY
          </span>
        )}
        {!isLive && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: 'rgba(80, 40, 140, 0.85)',
              color: '#c8a8f0',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 3,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Replay
          </span>
        )}

        {/* VTuber indicator */}
        {stream.vtuber_stream_url && (
          <span
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'rgba(10, 8, 20, 0.8)',
              color: '#c8a8f0',
              fontSize: 10,
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: 3,
            }}
          >
            🎭 VTuber
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px 12px' }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#e0d0ff',
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stream.label}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(180, 160, 220, 0.6)' }}>
          {modelShort}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 8,
            fontSize: 11,
            color: 'rgba(180, 160, 220, 0.5)',
          }}
        >
          <span>{stream.step_count} steps</span>
          {stream.final_score != null && (
            <span>Score: {stream.final_score.toFixed(0)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
