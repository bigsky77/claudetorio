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
}

interface LiveSessionWithScore {
  session_id: string;
  username: string;
  slot: number;
  started_at: string;
  current_score: number;
}

interface SystemStatus {
  total_slots: number;
  available_slots: number;
  active_sessions: ActiveSession[];
  total_users: number;
  total_sessions_all_time: number;
}

// Unified leaderboard entry - can be live or historical
interface UnifiedLeaderboardEntry {
  username: string;
  score: number;
  isLive: boolean;
  session_id?: string;
  // Historical fields
  total_playtime_hours?: number;
  sessions_played?: number;
  // Live fields
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

  // Data states
  const [factoryData, setFactoryData] = useState<FactoryData | null>(null);
  const [scoreData, setScoreData] = useState<SessionScore | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [productionData, setProductionData] = useState<ProductionData | null>(null);
  const [entitiesData, setEntitiesData] = useState<EntitiesData | null>(null);

  // Generic fetch helper
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
        if (data.error) {
          setError(data.error);
          return null;
        }
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

  // Load data when tab changes
  useEffect(() => {
    const loadTabData = async () => {
      switch (activeTab) {
        case 'factory':
          if (!factoryData) {
            const data = await fetchData('factory');
            if (data) setFactoryData(data);
          }
          break;
        case 'score':
          if (!scoreData) {
            const data = await fetchData('score');
            if (data) setScoreData(data);
          }
          break;
        case 'inventory':
          if (!inventoryData) {
            const data = await fetchData('inventory');
            if (data) setInventoryData(data);
          }
          break;
        case 'research':
          if (!researchData) {
            const data = await fetchData('research');
            if (data) setResearchData(data);
          }
          break;
        case 'production':
          if (!productionData) {
            const data = await fetchData('production');
            if (data) setProductionData(data);
          }
          break;
        case 'entities':
          if (!entitiesData) {
            const data = await fetchData('entities');
            if (data) setEntitiesData(data);
          }
          break;
      }
    };
    loadTabData();
  }, [activeTab, factoryData, scoreData, inventoryData, researchData, productionData, entitiesData, fetchData]);

  const handleDownload = () => {
    if (!isLive) {
      alert('Downloads only available for live sessions');
      return;
    }
    window.open(`${API_BASE}/api/session/${sessionId}/download`, '_blank');
  };

  const refreshCurrentTab = async () => {
    // Clear current data to force refresh
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold flex items-center">
              {isLive && <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>}
              {username}
            </h2>
            <p className="text-sm text-gray-400">Session: {sessionId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 overflow-x-auto">
          {(['score', 'inventory', 'research', 'production', 'factory', 'entities', 'download'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium capitalize whitespace-nowrap ${
                activeTab === tab
                  ? 'text-orange-400 border-b-2 border-orange-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {loading && <div className="text-gray-400 py-8 text-center">Loading...</div>}
          {error && <div className="text-red-400 py-8 text-center">{error}</div>}

          {/* Score Tab */}
          {activeTab === 'score' && !loading && scoreData && (
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-6 text-center">
                <div className="text-5xl font-bold text-orange-400 font-mono">
                  {scoreData.score.toLocaleString()}
                </div>
                <div className="text-gray-400 mt-2">Production Score</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-400">
                    {scoreData.playtime_formatted}
                  </div>
                  <div className="text-gray-400 text-sm">Playtime</div>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-400 capitalize">
                    {scoreData.status}
                  </div>
                  <div className="text-gray-400 text-sm">Status</div>
                </div>
              </div>
              {isLive && (
                <button onClick={refreshCurrentTab} className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
                  Refresh
                </button>
              )}
            </div>
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && !loading && inventoryData && (
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <div className="text-4xl font-bold text-purple-400">{inventoryData.total}</div>
                <div className="text-gray-400">Total Items</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="font-bold mb-3 text-gray-300">Inventory Contents</h3>
                {Object.keys(inventoryData.items).length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                    {Object.entries(inventoryData.items)
                      .sort(([, a], [, b]) => b - a)
                      .map(([name, count]) => (
                        <div key={name} className="flex justify-between bg-gray-800 rounded px-2 py-1 text-sm">
                          <span className="text-gray-400 truncate">{name}</span>
                          <span className="text-white font-mono ml-2">{count}</span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">Inventory is empty</p>
                )}
              </div>
              {isLive && (
                <button onClick={refreshCurrentTab} className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
                  Refresh
                </button>
              )}
            </div>
          )}

          {/* Research Tab */}
          {activeTab === 'research' && !loading && researchData && (
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="font-bold mb-2 text-gray-300">Current Research</h3>
                {researchData.current_research ? (
                  <div>
                    <div className="text-xl text-blue-400">{researchData.current_research}</div>
                    <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${researchData.progress * 100}%` }}
                      />
                    </div>
                    <div className="text-sm text-gray-400 mt-1">
                      {(researchData.progress * 100).toFixed(1)}% complete
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-500">No research in progress</p>
                )}
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="font-bold mb-3 text-gray-300">
                  Researched Technologies ({researchData.researched.length})
                </h3>
                {researchData.researched.length > 0 ? (
                  <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                    {researchData.researched.map((tech) => (
                      <span key={tech} className="bg-green-900/50 text-green-400 px-2 py-1 rounded text-sm">
                        {tech}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500">No technologies researched yet</p>
                )}
              </div>
              {isLive && (
                <button onClick={refreshCurrentTab} className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
                  Refresh
                </button>
              )}
            </div>
          )}

          {/* Production Tab */}
          {activeTab === 'production' && !loading && productionData && (
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="font-bold mb-3 text-gray-300">Net Production (Produced - Consumed)</h3>
                {Object.keys(productionData.net).length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {Object.entries(productionData.net)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 30)
                      .map(([name, count]) => (
                        <div key={name} className="flex justify-between bg-gray-800 rounded px-2 py-1 text-sm">
                          <span className="text-gray-400 truncate">{name}</span>
                          <span className={`font-mono ml-2 ${count > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {count > 0 ? '+' : ''}{count}
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No production data yet</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="font-bold mb-2 text-green-400">Produced</h3>
                  <div className="text-2xl font-mono">{Object.keys(productionData.produced).length} items</div>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <h3 className="font-bold mb-2 text-red-400">Consumed</h3>
                  <div className="text-2xl font-mono">{Object.keys(productionData.consumed).length} items</div>
                </div>
              </div>
              {isLive && (
                <button onClick={refreshCurrentTab} className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
                  Refresh
                </button>
              )}
            </div>
          )}

          {/* Factory Tab */}
          {activeTab === 'factory' && !loading && factoryData && (
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <div className="text-4xl font-bold text-blue-400">{factoryData.total_entities}</div>
                <div className="text-gray-400">Total Entities</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="font-bold mb-3 text-gray-300">Entity Breakdown</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {Object.entries(factoryData.entity_counts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 30)
                    .map(([name, count]) => (
                      <div key={name} className="flex justify-between bg-gray-800 rounded px-2 py-1 text-sm">
                        <span className="text-gray-400 truncate">{name}</span>
                        <span className="text-white font-mono ml-2">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
              {isLive && (
                <button onClick={refreshCurrentTab} className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
                  Refresh
                </button>
              )}
            </div>
          )}

          {/* Entities Tab */}
          {activeTab === 'entities' && !loading && entitiesData && (
            <div className="space-y-4">
              <div className="bg-gray-900 rounded-lg p-4 text-center">
                <div className="text-4xl font-bold text-cyan-400">{entitiesData.total}</div>
                <div className="text-gray-400">Total Entities (showing first 200)</div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="font-bold mb-3 text-gray-300">Entity List</h3>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-400">
                      <tr>
                        <th className="text-left py-1">Name</th>
                        <th className="text-right py-1">X</th>
                        <th className="text-right py-1">Y</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entitiesData.entities.slice(0, 100).map((entity, i) => (
                        <tr key={i} className="border-t border-gray-700">
                          <td className="py-1 text-gray-300">{entity.name}</td>
                          <td className="py-1 text-right font-mono text-gray-400">
                            {entity.position.x?.toFixed(1)}
                          </td>
                          <td className="py-1 text-right font-mono text-gray-400">
                            {entity.position.y?.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {isLive && (
                <button onClick={refreshCurrentTab} className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
                  Refresh
                </button>
              )}
            </div>
          )}

          {/* Download Tab */}
          {activeTab === 'download' && (
            <div className="text-center py-8">
              {isLive ? (
                <>
                  <p className="text-gray-400 mb-4">
                    Download the current game state as a save file.
                  </p>
                  <button
                    onClick={handleDownload}
                    className="px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium"
                  >
                    Download Save (.zip)
                  </button>
                </>
              ) : (
                <p className="text-gray-400">
                  Downloads are only available for active sessions.
                </p>
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

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
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

      // Fetch current scores for all active sessions
      if (statusData.active_sessions.length > 0) {
        const sessionScores = await Promise.all(
          statusData.active_sessions.map(async (session) => {
            try {
              const res = await fetch(`${API_BASE}/api/session/${session.session_id}`);
              if (res.ok) {
                const data = await res.json();
                console.log(`Session ${session.username} score:`, data.current_score);
                return {
                  session_id: session.session_id,
                  username: session.username,
                  slot: session.slot,
                  started_at: session.started_at,
                  current_score: data.current_score || 0,
                };
              } else {
                console.error(`Failed to fetch session ${session.session_id}:`, res.status);
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

  // Build unified leaderboard: merge historical + live, sorted by score
  const unifiedLeaderboard = useMemo(() => {
    const liveUsernames = new Set(liveSessions.map(s => s.username));

    // Start with historical entries (excluding users who are currently live)
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

    // Add live sessions
    const live: UnifiedLeaderboardEntry[] = liveSessions.map(session => ({
      username: session.username,
      score: session.current_score,
      isLive: true,
      session_id: session.session_id,
      started_at: session.started_at,
    }));

    // Combine and sort by score descending
    return [...historical, ...live].sort((a, b) => b.score - a.score);
  }, [leaderboard, liveSessions]);

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

        {/* Live Games */}
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
              {liveSessions.map((session) => (
                <div
                  key={session.session_id}
                  onClick={() => setSelectedSession({
                    sessionId: session.session_id,
                    username: session.username,
                    isLive: true,
                  })}
                  className="bg-gray-800 rounded-lg p-4 border border-green-500/30 hover:border-green-500/50 transition-colors cursor-pointer"
                >
                  <div className="flex justify-between items-start">
                    <div className="font-bold text-lg">{session.username}</div>
                    <div className="text-green-400 font-mono text-sm">
                      {formatElapsedTime(session.started_at)}
                    </div>
                  </div>
                  <div className="text-2xl font-mono text-green-400 mt-2">
                    {session.current_score.toLocaleString()}
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

        {/* Unified Leaderboard */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Leaderboard</h2>
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left">Rank</th>
                  <th className="px-4 py-3 text-left">Player</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">Status</th>
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
                    className={`border-t border-gray-700 hover:bg-gray-700/50 ${
                      entry.isLive ? 'bg-green-900/20' : ''
                    } ${entry.session_id ? 'cursor-pointer' : ''}`}
                  >
                    <td className="px-4 py-3">
                      {index < 3 ? (
                        <span className="text-2xl">
                          {index === 0 && '1st'}
                          {index === 1 && '2nd'}
                          {index === 2 && '3rd'}
                        </span>
                      ) : (
                        <span className="text-gray-400">#{index + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center">
                        {entry.isLive && (
                          <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                        )}
                        {entry.username}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${
                      entry.isLive ? 'text-green-400' : 'text-orange-400'
                    }`}>
                      {entry.score.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.isLive ? (
                        <span className="text-green-400 text-sm">
                          Playing ({formatElapsedTime(entry.started_at!)})
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">
                          {entry.sessions_played} sessions
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {unifiedLeaderboard.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No scores yet. Be the first to play!
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
