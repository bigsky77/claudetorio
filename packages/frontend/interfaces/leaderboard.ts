export interface LeaderboardEntry {
  rank: number;
  username: string;
  best_score: number;
  total_playtime_hours: number;
  sessions_played: number;
  last_played: string | null;
  best_session_id: string | null;
}

export interface RunsLeaderboardEntry {
  rank: number;
  username: string;
  avatar_url: string | null;
  model: string;
  best_score: number;
  best_run_id: string;
  milestone: string | null;
  status: string;
  run_count: number;
}

export interface UnifiedLeaderboardEntry {
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
