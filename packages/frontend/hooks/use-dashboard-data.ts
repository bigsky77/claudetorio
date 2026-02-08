import { useEffect, useState, useCallback, useMemo } from 'react';
import { API_BASE, REFRESH_INTERVAL_MS } from '@/constants';
import type {
  LeaderboardEntry,
  SystemStatus,
  LiveSessionWithScore,
  UnifiedLeaderboardEntry,
} from '@/interfaces';

export function useDashboardData() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSessionWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

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
                console.log(`Session ${session.username} score:`, data.current_score);
                return {
                  session_id: session.session_id,
                  username: session.username,
                  slot: session.slot,
                  started_at: session.started_at,
                  current_score: data.current_score || 0,
                  stream_url: session.stream_url,
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
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    leaderboard,
    status,
    liveSessions,
    unifiedLeaderboard,
    loading,
    lastUpdate,
  };
}
