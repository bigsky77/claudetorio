'use client';

import { useEffect, useState, useCallback } from 'react';
import { Background } from './components/Background';
import { SessionRow } from './components/SessionRow';
import { Leaderboard } from './components/Leaderboard';

interface LeaderboardEntry {
  rank: number;
  username: string;
  best_score: number;
  total_playtime_hours: number;
  sessions_played: number;
  last_played: string | null;
  best_session_id: string | null;
}

interface ActiveSession {
  session_id: string;
  username: string;
  slot: number;
  started_at: string;
  stream_url: string;
}

interface LiveSessionWithScore {
  session_id: string;
  username: string;
  slot: number;
  started_at: string;
  current_score: number;
  stream_url: string;
}

interface SystemStatus {
  total_slots: number;
  available_slots: number;
  active_sessions: ActiveSession[];
  total_users: number;
  total_sessions_all_time: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function Home() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSessionWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [lbRes, statusRes] = await Promise.all([
        fetch(`${API_BASE}/api/leaderboard`),
        fetch(`${API_BASE}/api/status`),
      ]);
      const leaderboardData = await lbRes.json();
      const statusData: SystemStatus = await statusRes.json();

      setLeaderboard(leaderboardData);
      setStatus(statusData);

      if (statusData.active_sessions.length > 0) {
        const sessionScores = await Promise.all(
          statusData.active_sessions.map(async (session) => {
            try {
              const res = await fetch(`${API_BASE}/api/session/${session.session_id}`);
              if (res.ok) {
                const data = await res.json();
                return {
                  session_id: session.session_id,
                  username: session.username,
                  slot: session.slot,
                  started_at: session.started_at,
                  current_score: data.current_score || 0,
                  stream_url: session.stream_url,
                };
              }
            } catch (err) {
              console.error(`Error fetching session ${session.session_id}:`, err);
            }
            return {
              session_id: session.session_id,
              username: session.username,
              slot: session.slot,
              started_at: session.started_at,
              current_score: 0,
              stream_url: session.stream_url,
            };
          })
        );
        setLiveSessions(sessionScores);
      } else {
        setLiveSessions([]);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Tick every second for elapsed time display
  useEffect(() => {
    const ticker = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(ticker);
  }, []);

  if (loading) {
    return (
      <main className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
        <Background />
        <div className="flex flex-1 items-center justify-center">
          <span className="font-mono text-sm text-zinc-500">Loading...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <Background />

      {/* Top bar */}
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-800/70 bg-zinc-950/80 px-6 py-3 backdrop-blur">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-sm tracking-wider text-zinc-200">claudetorio</span>
          <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-500">
            alpha
          </span>
        </div>
        <div className="flex items-center gap-4">
          {status && (
            <div className="flex items-center gap-4 font-mono text-xs text-zinc-500">
              <span>{status.available_slots} slots open</span>
              <span>{status.active_sessions.length} live</span>
              <span>{status.total_users} players</span>
            </div>
          )}
        </div>
      </header>

      {/* Main scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1800px] mx-auto px-6 py-6 space-y-6">

          {/* Live Sessions — 3-panel rows */}
          {liveSessions.length > 0 && (
            <section>
              <div className="flex items-center mb-3">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
                <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-300">Live Sessions</h2>
                <span className="ml-auto font-mono text-[10px] text-zinc-600">
                  {liveSessions.length} active
                </span>
              </div>
              <div className="space-y-4">
                {liveSessions.map((session) => (
                  <SessionRow
                    key={session.session_id}
                    sessionId={session.session_id}
                    username={session.username}
                    slot={session.slot}
                    startedAt={session.started_at}
                    streamUrl={session.stream_url}
                    currentScore={session.current_score}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {liveSessions.length === 0 && (
            <section className="rounded border border-zinc-800 bg-zinc-950 p-12 text-center">
              <div className="font-mono text-zinc-600 text-sm">No active sessions</div>
              <div className="font-mono text-zinc-700 text-xs mt-1">
                Run connect.sh to start a session
              </div>
            </section>
          )}

          {/* Leaderboard */}
          <Leaderboard
            leaderboard={leaderboard}
            liveSessions={liveSessions.map((s) => ({
              session_id: s.session_id,
              username: s.username,
              started_at: s.started_at,
              current_score: s.current_score,
            }))}
          />
        </div>
      </div>

      {/* Footer */}
      <footer className="z-50 flex shrink-0 items-center justify-between border-t border-zinc-800/70 bg-zinc-950/80 px-6 py-2.5 text-xs text-zinc-500 backdrop-blur">
        <span className="font-mono">&copy; {new Date().getFullYear()} Claudetorio</span>
        <div className="flex items-center gap-4 font-mono">
          <a className="hover:text-zinc-300 transition-colors" href="https://github.com/JackHopkins/factorio-learning-environment">FLE</a>
          <a className="hover:text-zinc-300 transition-colors" href="https://claudetorio.ai">Home</a>
        </div>
      </footer>
    </main>
  );
}
