'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

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

interface UnifiedLeaderboardEntry {
  username: string;
  score: number;
  isLive: boolean;
  session_id?: string;
  total_playtime_hours?: number;
  sessions_played?: number;
  started_at?: string;
}

interface SessionScore {
  session_id: string;
  username: string;
  status: string;
  score: number;
  playtime_seconds: number;
  playtime_formatted: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// Background component matching landing page
function Background() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 opacity-50"
      style={{
        backgroundImage:
          'radial-gradient(700px 400px at 20% 10%, rgba(255,255,255,0.08), transparent 60%),' +
          'radial-gradient(700px 400px at 80% 25%, rgba(255,140,0,0.11), transparent 55%),' +
          'radial-gradient(500px 300px at 70% 90%, rgba(0,255,140,0.05), transparent 60%),' +
          'linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px),' +
          'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: 'auto, auto, auto, 40px 40px, 40px 40px',
      }}
    />
  );
}

// Live stream thumbnail — small non-interactive iframe of the game stream
function GameThumbnail({ streamUrl }: { streamUrl: string }) {
  return (
    <div className="w-full aspect-video bg-zinc-900 overflow-hidden scanline relative">
      <iframe
        src={streamUrl}
        className="w-full h-full border-0 pointer-events-none"
        title="Game preview"
        loading="lazy"
      />
    </div>
  );
}

// Session Detail Modal Component
interface FactoryData {
  total_entities: number;
  entity_counts: Record<string, number>;
  has_water: boolean;
  error?: string;
}

interface InventoryData {
  items: Record<string, number>;
  total: number;
  error?: string;
}

interface ResearchData {
  current_research: string | null;
  progress: number;
  researched: string[];
  error?: string;
}

interface ProductionData {
  produced: Record<string, number>;
  consumed: Record<string, number>;
  net: Record<string, number>;
  error?: string;
}

interface EntitiesData {
  entities: Array<{ name: string; position: { x: number; y: number }; direction: number }>;
  total: number;
  error?: string;
}

type TabType = 'factory' | 'entities' | 'inventory' | 'research' | 'production' | 'score' | 'download';

// Stream Viewer Modal Component
function StreamModal({
  username,
  streamUrl,
  onClose,
  onViewDetails,
}: {
  username: string;
  streamUrl: string;
  onClose: () => void;
  onViewDetails: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="relative w-full h-full max-w-7xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-t backdrop-blur">
          <div className="flex items-center">
            <span className="w-3 h-3 bg-emerald-500 rounded-full mr-3 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
            <h2 className="text-xl font-bold font-mono">Watching: {username}</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onViewDetails}
              className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm font-mono transition-colors"
            >
              View Details
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded text-2xl leading-none transition-colors"
              title="Close (Esc)"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="flex-1 bg-black rounded-b border-x border-b border-zinc-800 overflow-hidden scanline">
          <iframe
            src={streamUrl}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen"
            title={`Live stream: ${username}`}
          />
        </div>
      </div>
    </div>
  );
}

function SessionModal({
  sessionId,
  username,
  isLive,
  onClose,
}: {
  sessionId: string;
  username: string;
  isLive: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabType>('score');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [factoryData, setFactoryData] = useState<FactoryData | null>(null);
  const [scoreData, setScoreData] = useState<SessionScore | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [productionData, setProductionData] = useState<ProductionData | null>(null);
  const [entitiesData, setEntitiesData] = useState<EntitiesData | null>(null);

  const fetchData = useCallback(async (endpoint: string) => {
    if (!isLive && endpoint !== 'score') {
      setError('Data only available for live sessions');
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/session/${sessionId}/${endpoint}`);
      if (res.ok) {
        const data = await res.json();
        if (data.error) { setError(data.error); return null; }
        return data;
      } else {
        setError(`Failed to load ${endpoint} data`);
        return null;
      }
    } catch {
      setError(`Failed to load ${endpoint} data`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [sessionId, isLive]);

  useEffect(() => {
    const loadTabData = async () => {
      switch (activeTab) {
        case 'factory': if (!factoryData) { const d = await fetchData('factory'); if (d) setFactoryData(d); } break;
        case 'score': if (!scoreData) { const d = await fetchData('score'); if (d) setScoreData(d); } break;
        case 'inventory': if (!inventoryData) { const d = await fetchData('inventory'); if (d) setInventoryData(d); } break;
        case 'research': if (!researchData) { const d = await fetchData('research'); if (d) setResearchData(d); } break;
        case 'production': if (!productionData) { const d = await fetchData('production'); if (d) setProductionData(d); } break;
        case 'entities': if (!entitiesData) { const d = await fetchData('entities'); if (d) setEntitiesData(d); } break;
      }
    };
    loadTabData();
  }, [activeTab, factoryData, scoreData, inventoryData, researchData, productionData, entitiesData, fetchData]);

  const handleDownload = () => {
    if (!isLive) { alert('Downloads only available for live sessions'); return; }
    window.open(`${API_BASE}/api/session/${sessionId}/download`, '_blank');
  };

  const refreshCurrentTab = async () => {
    switch (activeTab) {
      case 'factory': setFactoryData(null); break;
      case 'score': setScoreData(null); break;
      case 'inventory': setInventoryData(null); break;
      case 'research': setResearchData(null); break;
      case 'production': setProductionData(null); break;
      case 'entities': setEntitiesData(null); break;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded border border-zinc-800 bg-zinc-950 max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 overflow-x-auto">
          {(['score', 'inventory', 'research', 'production', 'factory', 'entities', 'download'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-mono text-xs uppercase tracking-widest whitespace-nowrap ${
                activeTab === tab
                  ? 'text-amber-400 border-b-2 border-amber-400'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {loading && <div className="text-zinc-500 py-8 text-center font-mono text-sm">Loading...</div>}
          {error && <div className="text-red-400 py-8 text-center font-mono text-sm">{error}</div>}

          {activeTab === 'score' && !loading && scoreData && (
            <div className="space-y-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-6 text-center">
                <div className="text-5xl font-bold text-amber-400 font-mono">{scoreData.score.toLocaleString()}</div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 mt-2">Production Score</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-2xl font-bold text-blue-400 font-mono">{scoreData.playtime_formatted}</div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 mt-1">Playtime</div>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                  <div className="text-2xl font-bold text-emerald-400 capitalize font-mono">{scoreData.status}</div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 mt-1">Status</div>
                </div>
              </div>
              {isLive && (
                <button onClick={refreshCurrentTab} className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded font-mono text-sm">Refresh</button>
              )}
            </div>
          )}

          {activeTab === 'inventory' && !loading && inventoryData && (
            <div className="space-y-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4 text-center">
                <div className="text-4xl font-bold text-purple-400 font-mono">{inventoryData.total}</div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 mt-1">Total Items</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-300 mb-3">Inventory Contents</h3>
                {Object.keys(inventoryData.items).length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                    {Object.entries(inventoryData.items).sort(([, a], [, b]) => b - a).map(([name, count]) => (
                      <div key={name} className="flex justify-between bg-zinc-900 rounded border border-zinc-800 px-2 py-1 text-sm">
                        <span className="text-zinc-400 truncate font-mono">{name}</span>
                        <span className="text-white font-mono ml-2">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500 text-center py-4 font-mono text-sm">Inventory is empty</p>
                )}
              </div>
              {isLive && <button onClick={refreshCurrentTab} className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded font-mono text-sm">Refresh</button>}
            </div>
          )}

          {activeTab === 'research' && !loading && researchData && (
            <div className="space-y-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-300 mb-2">Current Research</h3>
                {researchData.current_research ? (
                  <div>
                    <div className="text-xl text-blue-400 font-mono">{researchData.current_research}</div>
                    <div className="mt-2 h-1 bg-zinc-800 rounded overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${researchData.progress * 100}%` }} />
                    </div>
                    <div className="text-xs font-mono text-zinc-500 mt-1">{(researchData.progress * 100).toFixed(1)}% complete</div>
                  </div>
                ) : (
                  <p className="text-zinc-500 font-mono text-sm">No research in progress</p>
                )}
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-300 mb-3">Researched Technologies ({researchData.researched.length})</h3>
                {researchData.researched.length > 0 ? (
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                    {researchData.researched.map((tech) => (
                      <span key={tech} className="bg-emerald-950/50 text-emerald-400 border border-emerald-800/40 px-2 py-1 rounded text-xs font-mono">{tech}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500 font-mono text-sm">No technologies researched yet</p>
                )}
              </div>
              {isLive && <button onClick={refreshCurrentTab} className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded font-mono text-sm">Refresh</button>}
            </div>
          )}

          {activeTab === 'production' && !loading && productionData && (
            <div className="space-y-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-300 mb-3">Net Production (Produced - Consumed)</h3>
                {Object.keys(productionData.net).length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {Object.entries(productionData.net).sort(([, a], [, b]) => b - a).slice(0, 30).map(([name, count]) => (
                      <div key={name} className="flex justify-between bg-zinc-900 rounded border border-zinc-800 px-2 py-1 text-sm">
                        <span className="text-zinc-400 truncate font-mono">{name}</span>
                        <span className={`font-mono ml-2 ${count > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{count > 0 ? '+' : ''}{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-zinc-500 text-center py-4 font-mono text-sm">No production data yet</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-emerald-400 mb-2">Produced</h3>
                  <div className="text-2xl font-mono">{Object.keys(productionData.produced).length} items</div>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                  <h3 className="font-mono text-[11px] uppercase tracking-widest text-red-400 mb-2">Consumed</h3>
                  <div className="text-2xl font-mono">{Object.keys(productionData.consumed).length} items</div>
                </div>
              </div>
              {isLive && <button onClick={refreshCurrentTab} className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded font-mono text-sm">Refresh</button>}
            </div>
          )}

          {activeTab === 'factory' && !loading && factoryData && (
            <div className="space-y-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4 text-center">
                <div className="text-4xl font-bold text-blue-400 font-mono">{factoryData.total_entities}</div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 mt-1">Total Entities</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-300 mb-3">Entity Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {Object.entries(factoryData.entity_counts).sort(([, a], [, b]) => b - a).slice(0, 30).map(([name, count]) => (
                    <div key={name} className="flex justify-between bg-zinc-900 rounded border border-zinc-800 px-2 py-1 text-sm">
                      <span className="text-zinc-400 truncate font-mono">{name}</span>
                      <span className="text-white font-mono ml-2">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              {isLive && <button onClick={refreshCurrentTab} className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded font-mono text-sm">Refresh</button>}
            </div>
          )}

          {activeTab === 'entities' && !loading && entitiesData && (
            <div className="space-y-4">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4 text-center">
                <div className="text-4xl font-bold text-cyan-400 font-mono">{entitiesData.total}</div>
                <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-400 mt-1">Total Entities (showing first 200)</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="font-mono text-[11px] uppercase tracking-widest text-zinc-300 mb-3">Entity List</h3>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm font-mono">
                    <thead className="text-zinc-400">
                      <tr>
                        <th className="text-left py-1 text-[11px] uppercase tracking-widest">Name</th>
                        <th className="text-right py-1 text-[11px] uppercase tracking-widest">X</th>
                        <th className="text-right py-1 text-[11px] uppercase tracking-widest">Y</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entitiesData.entities.slice(0, 100).map((entity, i) => (
                        <tr key={i} className="border-t border-zinc-800/60">
                          <td className="py-1 text-zinc-300">{entity.name}</td>
                          <td className="py-1 text-right text-zinc-400">{entity.position.x?.toFixed(1)}</td>
                          <td className="py-1 text-right text-zinc-400">{entity.position.y?.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {isLive && <button onClick={refreshCurrentTab} className="w-full px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded font-mono text-sm">Refresh</button>}
            </div>
          )}

          {activeTab === 'download' && (
            <div className="text-center py-8">
              {isLive ? (
                <>
                  <p className="text-zinc-400 mb-4 font-mono text-sm">Download the current game state as a save file.</p>
                  <button onClick={handleDownload} className="px-3 py-2 bg-amber-600 hover:bg-amber-500 rounded font-mono text-sm">Download Save (.zip)</button>
                </>
              ) : (
                <p className="text-zinc-500 font-mono text-sm">Downloads are only available for active sessions.</p>
              )}
            </div>
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

export default function Home() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSessionWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [, setTick] = useState(0);
  const [selectedSession, setSelectedSession] = useState<{
    sessionId: string;
    username: string;
    isLive: boolean;
  } | null>(null);
  const [streamSession, setStreamSession] = useState<{
    sessionId: string;
    username: string;
    streamUrl: string;
  } | null>(null);

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
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const unifiedLeaderboard = useMemo(() => {
    const liveUsernames = new Set(liveSessions.map(s => s.username));
    const historical: UnifiedLeaderboardEntry[] = leaderboard
      .filter(entry => !liveUsernames.has(entry.username))
      .map(entry => ({
        username: entry.username,
        score: entry.best_score,
        isLive: false,
        session_id: entry.best_session_id || undefined,
        total_playtime_hours: entry.total_playtime_hours,
        sessions_played: entry.sessions_played,
      }));
    const live: UnifiedLeaderboardEntry[] = liveSessions.map(session => ({
      username: session.username,
      score: session.current_score,
      isLive: true,
      session_id: session.session_id,
      started_at: session.started_at,
    }));
    return [...historical, ...live].sort((a, b) => b.score - a.score);
  }, [leaderboard, liveSessions]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const ticker = setInterval(() => setTick(t => t + 1), 1000);
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

      {/* Top bar — matches landing page */}
      <header className="z-50 flex shrink-0 items-center justify-between border-b border-zinc-800/70 bg-zinc-950/80 px-6 py-3 backdrop-blur">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-sm tracking-wider text-zinc-200">
            claudetorio
          </span>
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
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

          {/* Live Games */}
          {liveSessions.length > 0 && (
            <section>
              <div className="flex items-center mb-3">
                <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
                <h2 className="font-mono text-xs uppercase tracking-widest text-zinc-300">Live Games</h2>
                <span className="ml-auto font-mono text-[10px] text-zinc-600">
                  {lastUpdate.toLocaleTimeString()}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {liveSessions.map((session) => (
                  <div
                    key={session.session_id}
                    onClick={() => setStreamSession({
                      sessionId: session.session_id,
                      username: session.username,
                      streamUrl: session.stream_url,
                    })}
                    className="rounded border border-emerald-500/30 bg-zinc-950 hover:border-emerald-500/50 transition-colors cursor-pointer overflow-hidden group"
                  >
                    {/* Live stream thumbnail */}
                    <div className="relative">
                      <GameThumbnail streamUrl={session.stream_url} />
                      {/* Overlay info on hover */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <span className="font-mono text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity">
                          Watch Live
                        </span>
                      </div>
                      {/* Live badge */}
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 backdrop-blur">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]"></span>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-200">Live</span>
                      </div>
                      {/* Elapsed time badge */}
                      <div className="absolute top-2 right-2 rounded bg-black/70 px-2 py-1 backdrop-blur">
                        <span className="font-mono text-[10px] text-zinc-300">
                          {formatElapsedTime(session.started_at)}
                        </span>
                      </div>
                    </div>
                    {/* Card info bar */}
                    <div className="px-3 py-2 flex items-center justify-between bg-zinc-900/80 border-t border-zinc-800/50">
                      <span className="font-mono text-sm text-zinc-200 truncate">{session.username}</span>
                      <span className="font-mono text-sm text-emerald-400">{session.current_score.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Leaderboard */}
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
                  {unifiedLeaderboard.map((entry, index) => (
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
                  {unifiedLeaderboard.length === 0 && (
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
        </div>
      </div>

      {/* Pinned bottom bar — matches landing page */}
      <footer className="z-50 flex shrink-0 items-center justify-between border-t border-zinc-800/70 bg-zinc-950/80 px-6 py-2.5 text-xs text-zinc-500 backdrop-blur">
        <span className="font-mono">&copy; {new Date().getFullYear()} Claudetorio</span>
        <div className="flex items-center gap-4 font-mono">
          <a className="hover:text-zinc-300 transition-colors" href="https://github.com/JackHopkins/factorio-learning-environment">
            FLE
          </a>
          <a className="hover:text-zinc-300 transition-colors" href="https://claudetorio.ai">
            Home
          </a>
        </div>
      </footer>

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
    </main>
  );
}
