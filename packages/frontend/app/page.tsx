'use client';

import { useState } from 'react';
import StreamsSection from '@/components/home/StreamsSection';
import TournamentSection from '@/components/home/TournamentSection';
import BenchmarksSection from '@/components/home/BenchmarksSection';
import StartRunForm from '@/components/StartRunForm';

export default function Home() {
  const [showForm, setShowForm] = useState(false);

  return (
    <main
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: '32px 24px',
      }}
    >
      {/* Header with Start Run button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 32,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: '#e0d0ff',
            letterSpacing: '-0.02em',
          }}
        >
          🏭 Claudetorio
        </h1>
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 20px',
            background: 'linear-gradient(135deg, #7040c8 0%, #9060e0 100%)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.2s, transform 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
          }}
        >
          + New Run
        </button>
      </div>

      <StreamsSection />
      <TournamentSection />
      <BenchmarksSection />

      {showForm && <StartRunForm onClose={() => setShowForm(false)} />}
    </main>
  );
}
