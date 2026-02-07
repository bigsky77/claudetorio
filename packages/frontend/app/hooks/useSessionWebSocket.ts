'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface ActivityEvent {
  type: 'thinking' | 'tool_use' | 'code_exec' | 'output' | 'error' | 'commit' | 'system';
  timestamp: string;
  summary: string;
  detail?: string;
  metadata?: Record<string, unknown>;
}

export interface RunStats {
  score: number;
  game_tick: number;
  playtime_seconds: number;
  inventory_summary?: Record<string, unknown>;
  research?: Record<string, unknown>;
  production_summary?: Record<string, unknown>;
  entity_count: number;
}

interface WSMessage {
  type: 'activity' | 'run_stats' | 'score_update';
  session_id?: string;
  timestamp?: string;
  payload?: unknown;
  score?: number;
}

const MAX_ACTIVITIES = 200;

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function useSessionWebSocket(sessionId: string) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = API_BASE
      ? API_BASE.replace(/^https?:/, protocol)
      : `${protocol}//${window.location.host}`;
    const url = `${wsBase}/api/session/${sessionId}/stream`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'activity':
            setActivities((prev) => {
              const next = [...prev, msg.payload as ActivityEvent];
              return next.length > MAX_ACTIVITIES ? next.slice(-MAX_ACTIVITIES) : next;
            });
            break;
          case 'run_stats':
            setRunStats(msg.payload as RunStats);
            break;
          case 'score_update':
            setRunStats((prev) => prev
              ? { ...prev, score: msg.score ?? prev.score }
              : { score: msg.score ?? 0, game_tick: 0, playtime_seconds: 0, entity_count: 0 });
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimeout.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { activities, runStats, connected };
}
