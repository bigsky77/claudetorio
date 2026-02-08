'use client';

import { useState } from 'react';
import type { SelectedSession, StreamSession } from '@/interfaces';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useElapsedTicker } from '@/hooks/use-elapsed-ticker';
import StatusCards from './StatusCards';
import LiveGamesGrid from './LiveGamesGrid';
import Leaderboard from './Leaderboard';
import StreamModal from './StreamModal';
import SessionModal from './SessionModal/SessionModal';
import StartRunForm from './StartRunForm';

export default function Dashboard() {
  const {
    status,
    liveSessions,
    unifiedLeaderboard,
    loading,
    lastUpdate,
  } = useDashboardData();

  useElapsedTicker();

  const [selectedSession, setSelectedSession] = useState<SelectedSession | null>(null);
  const [streamSession, setStreamSession] = useState<StreamSession | null>(null);
  const [showStartForm, setShowStartForm] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-yellow-400 bg-clip-text text-transparent">
            Claudetorio
          </h1>
          <p className="text-xl text-gray-400">
            Live-streamed AI evaluation for complex reasoning tasks
          </p>
          <button
            onClick={() => setShowStartForm(true)}
            className="mt-4 px-5 py-2 bg-orange-600 hover:bg-orange-500 rounded font-medium transition-colors"
          >
            Start Run
          </button>
        </div>

        {/* Status Cards */}
        {status && <StatusCards status={status} />}

        {/* Live Games */}
        {status && status.active_sessions.length > 0 && (
          <LiveGamesGrid
            liveSessions={liveSessions}
            lastUpdate={lastUpdate}
            onSelectStream={setStreamSession}
          />
        )}

        {/* Unified Leaderboard */}
        <Leaderboard
          unifiedLeaderboard={unifiedLeaderboard}
          onSelectSession={setSelectedSession}
        />

        {/* Quick Start */}
        <div className="mt-12 bg-gray-800 rounded-lg p-6">
          <h2 className="text-2xl font-bold mb-4">Quick Start</h2>
          <pre className="bg-gray-900 rounded p-4 overflow-x-auto text-sm">
{`# Clone the quickstart repo
git clone https://github.com/bigsky77/claudetorio-quickstart
cd claudetorio-quickstart

# Connect to the arena
./connect.sh

# Follow the prompts to start playing!`}
          </pre>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          Powered by{' '}
          <a
            href="https://github.com/JackHopkins/factorio-learning-environment"
            className="text-blue-400 hover:underline"
          >
            Factorio Learning Environment
          </a>
        </div>
      </div>

      {/* Stream Viewer Modal */}
      {streamSession && (
        <StreamModal
          username={streamSession.username}
          streamUrl={streamSession.streamUrl}
          onClose={() => setStreamSession(null)}
          onViewDetails={() => {
            const session = liveSessions.find(s => s.session_id === streamSession.sessionId);
            if (session) {
              setStreamSession(null);
              setSelectedSession({
                sessionId: session.session_id,
                username: session.username,
                isLive: true,
              });
            }
          }}
        />
      )}

      {/* Session Detail Modal */}
      {selectedSession && (
        <SessionModal
          sessionId={selectedSession.sessionId}
          username={selectedSession.username}
          isLive={selectedSession.isLive}
          onClose={() => setSelectedSession(null)}
        />
      )}

      {/* Start Run Modal */}
      {showStartForm && (
        <StartRunForm onClose={() => setShowStartForm(false)} />
      )}
    </main>
  );
}
