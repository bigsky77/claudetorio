'use client';

import { useEffect, useState, useCallback } from 'react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  best_score: number;
  total_playtime_hours: number;
  sessions_played: number;
  last_played: string | null;
}

interface ActiveSession {
  session_id: string;
  username: string;
  slot: number;
  started_at: string;
}

interface SystemStatus {
  total_slots: number;
  available_slots: number;
  active_sessions: ActiveSession[];
  total_users: number;
  total_sessions_all_time: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

function formatElapsedTime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}

export default function Home() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [, setTick] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [lbRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/api/leaderboard`),
        fetch(`${API_BASE}/api/status`),
      ]);
      setLeaderboard(await lbRes.json());
      setStatus(await statusRes.json());
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Update elapsed time display every second
  useEffect(() => {
    const ticker = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(ticker);
  }, []);

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
            Autonomous Factorio Arena - Let Claude build your factory
          </p>
        </div>

        {/* Status Cards */}
        {status && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-3xl font-bold text-green-400">
                {status.available_slots}
              </div>
              <div className="text-gray-400">Slots Available</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-3xl font-bold text-blue-400">
                {status.active_sessions.length}
              </div>
              <div className="text-gray-400">Active Games</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-3xl font-bold text-purple-400">
                {status.total_users}
              </div>
              <div className="text-gray-400">Total Players</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-3xl font-bold text-orange-400">
                {status.total_sessions_all_time}
              </div>
              <div className="text-gray-400">Games Played</div>
            </div>
          </div>
        )}

        {/* Active Sessions */}
        {status && status.active_sessions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 flex items-center">
              <span className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
              Live Games
              <span className="ml-auto text-sm font-normal text-gray-500">
                Updated {lastUpdate.toLocaleTimeString()}
              </span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {status.active_sessions.map((session) => (
                <div
                  key={session.session_id}
                  className="bg-gray-800 rounded-lg p-4 border border-green-500/30 hover:border-green-500/50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-lg">{session.username}</div>
                    <div className="text-green-400 font-mono text-sm">
                      {formatElapsedTime(session.started_at)}
                    </div>
                  </div>
                  <div className="text-gray-400 text-sm mt-1">
                    Slot {session.slot}
                  </div>
                  <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 to-green-400 animate-pulse"
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Leaderboard</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-right">Best Score</th>
                  <th className="px-4 py-3 text-right">Playtime</th>
                  <th className="px-4 py-3 text-right">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr
                    key={entry.username}
                    className="border-t border-gray-700 hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3">
                      {entry.rank <= 3 ? (
                        <span className="text-2xl">
                          {entry.rank === 1 && '1st'}
                          {entry.rank === 2 && '2nd'}
                          {entry.rank === 3 && '3rd'}
                        </span>
                      ) : (
                        <span className="text-gray-400">#{entry.rank}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{entry.username}</td>
                    <td className="px-4 py-3 text-right font-mono text-orange-400">
                      {entry.best_score.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {entry.total_playtime_hours.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400">
                      {entry.sessions_played}
                    </td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      {status && status.active_sessions.length > 0
                        ? 'Games in progress - scores update when sessions complete!'
                        : 'No scores yet. Be the first to play!'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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
    </main>
  );
}
