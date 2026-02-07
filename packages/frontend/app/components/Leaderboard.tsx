'use client';

import { useState } from 'react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  best_score: number;
  total_playtime_hours: number;
  sessions_played: number;
  last_played: string | null;
  best_session_id: string | null;
}

interface LiveSession {
  session_id: string;
  username: string;
  started_at: string;
  current_score: number;
}

interface UnifiedEntry {
  username: string;
  score: number;
  isLive: boolean;
  session_id?: string;
  total_playtime_hours?: number;
  sessions_played?: number;
  started_at?: string;
}

// Inline session detail modal (kept from original page.tsx)
interface SessionModalProps {
  sessionId: string;
  username: string;
  isLive: boolean;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

type TabType = 'score' | 'inventory' | 'research' | 'production' | 'factory' | 'download';

function SessionModal({ sessionId, username, isLive, onClose }: SessionModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('score');
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Record<string, Record<string, unknown>>>({});

  const fetchTab = async (tab: string) => {
    if (loadedTabs[tab]) { setData(loadedTabs[tab]); return; }
    if (!isLive && tab !== 'score') { setError('Data only available for live sessions'); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/session/${sessionId}/${tab}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        setLoadedTabs((prev) => ({ ...prev, [tab]: d }));
      } else { setError(`Failed to load ${tab}`); }
    } catch { setError(`Failed to load ${tab}`); }
    finally { setLoading(false); }
  };

  const onTabClick = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'download') return;
    fetchTab(tab);
  };

  // Load score on mount
  if (!data && !loading && !error) fetchTab('score');

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="rounded border border-zinc-800 bg-zinc-950 max-w-4xl w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-bold font-mono flex items-center">
              {isLive && <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>}
              {username}
            </h2>
            <p className="text-xs font-mono text-zinc-500 mt-0.5">Session: {sessionId}</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>
        <div className="flex border-b border-zinc-800 overflow-x-auto">
          {(['score', 'inventory', 'research', 'production', 'factory', 'download'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => onTabClick(tab)}
              className={`px-4 py-3 font-mono text-xs uppercase tracking-widest whitespace-nowrap ${
                activeTab === tab ? 'text-amber-400 border-b-2 border-amber-400' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {loading && <div className="text-zinc-500 py-8 text-center font-mono text-sm">Loading...</div>}
          {error && <div className="text-red-400 py-8 text-center font-mono text-sm">{error}</div>}
          {activeTab === 'score' && !loading && data && (
            <div className="space-y-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-6 text-center">
                <div className="text-5xl font-bold text-amber-400 font-mono">{((data as Record<string, number>).score ?? 0).toLocaleString()}</div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 mt-2">Production Score</div>
              </div>
            </div>
          )}
          {activeTab === 'download' && (
            <div className="text-center py-8">
              {isLive ? (
                <button onClick={() => window.open(`${API_BASE}/api/session/${sessionId}/download`, '_blank')} className="px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded font-mono text-sm">Download Save</button>
              ) : (
                <p className="text-zinc-500 font-mono text-sm">Downloads only available for active sessions.</p>
              )}
            </div>
          )}
          {activeTab !== 'score' && activeTab !== 'download' && !loading && data && (
            <pre className="font-mono text-xs text-zinc-400 whitespace-pre-wrap max-h-96 overflow-y-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function formatElapsedTime(startedAt: string): string {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const elapsed = Math.floor((now - start) / 1000);
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

interface LeaderboardProps {
  leaderboard: LeaderboardEntry[];
  liveSessions: LiveSession[];
}

export function Leaderboard({ leaderboard, liveSessions }: LeaderboardProps) {
  const [selectedSession, setSelectedSession] = useState<{
    sessionId: string; username: string; isLive: boolean;
  } | null>(null);

  const liveUsernames = new Set(liveSessions.map((s) => s.username));
  const historical: UnifiedEntry[] = leaderboard
    .filter((entry) => !liveUsernames.has(entry.username))
    .map((entry) => ({
      username: entry.username,
      score: entry.best_score,
      isLive: false,
      session_id: entry.best_session_id || undefined,
      total_playtime_hours: entry.total_playtime_hours,
      sessions_played: entry.sessions_played,
    }));
  const live: UnifiedEntry[] = liveSessions.map((session) => ({
    username: session.username,
    score: session.current_score,
    isLive: true,
    session_id: session.session_id,
    started_at: session.started_at,
  }));
  const unified = [...historical, ...live].sort((a, b) => b.score - a.score);

  return (
    <>
      <section>
        <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-300 mb-3">Leaderboard</h2>
        <div className="rounded border border-zinc-800 bg-zinc-950 overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-900">
              <tr>
                <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-widest text-zinc-400">Rank</th>
                <th className="px-4 py-2.5 text-left font-mono text-[11px] uppercase tracking-widest text-zinc-400">Player</th>
                <th className="px-4 py-2.5 text-right font-mono text-[11px] uppercase tracking-widest text-zinc-400">Score</th>
                <th className="px-4 py-2.5 text-right font-mono text-[11px] uppercase tracking-widest text-zinc-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {unified.map((entry, index) => (
                <tr
                  key={entry.username}
                  onClick={() => entry.session_id && setSelectedSession({
                    sessionId: entry.session_id,
                    username: entry.username,
                    isLive: entry.isLive,
                  })}
                  className={`border-t border-zinc-800/60 hover:bg-zinc-900/50 ${
                    entry.isLive ? 'bg-emerald-950/20' : ''
                  } ${entry.session_id ? 'cursor-pointer' : ''}`}
                >
                  <td className="px-4 py-2.5 font-mono">
                    {index < 3 ? (
                      <span className="text-amber-400">{['1st', '2nd', '3rd'][index]}</span>
                    ) : (
                      <span className="text-zinc-500">#{index + 1}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm">
                    <div className="flex items-center">
                      {entry.isLive && (
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-2 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
                      )}
                      {entry.username}
                    </div>
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono text-sm ${
                    entry.isLive ? 'text-emerald-400' : 'text-amber-400'
                  }`}>
                    {entry.score.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                    {entry.isLive ? (
                      <span className="text-emerald-400">Playing ({formatElapsedTime(entry.started_at!)})</span>
                    ) : (
                      <span className="text-zinc-500">{entry.sessions_played} sessions</span>
                    )}
                  </td>
                </tr>
              ))}
              {unified.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500 font-mono text-sm">
                    No scores yet. Be the first to play!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedSession && (
        <SessionModal
          sessionId={selectedSession.sessionId}
          username={selectedSession.username}
          isLive={selectedSession.isLive}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </>
  );
}
