export interface ActiveSession {
  session_id: string;
  username: string;
  slot: number;
  started_at: string;
  stream_url: string;
  stream_host?: string;
  stream_port?: number;
  stream_scheme?: string;
}

export interface LiveSessionWithScore {
  session_id: string;
  username: string;
  slot: number;
  started_at: string;
  current_score: number;
  stream_url: string;
  stream_host?: string;
  stream_port?: number;
  stream_scheme?: string;
}

export interface SessionScore {
  session_id: string;
  username: string;
  status: string;
  score: number;
  playtime_seconds: number;
  playtime_formatted: string;
}

export interface SelectedSession {
  sessionId: string;
  username: string;
  isLive: boolean;
}

export interface StreamSession {
  sessionId: string;
  username: string;
  streamUrl: string;
}
