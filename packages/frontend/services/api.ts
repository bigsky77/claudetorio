import { API_BASE } from '@/constants';
import type {
  LeaderboardEntry,
  SystemStatus,
  SessionScore,
  FactoryData,
  InventoryData,
  ResearchData,
  ProductionData,
  EntitiesData,
  RunInfo,
  RunStepInfo,
  StreamInfo,
} from '@/interfaces';

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const res = await fetch(`${API_BASE}/api/leaderboard`);
  return res.json();
}

export async function fetchStatus(): Promise<SystemStatus> {
  const res = await fetch(`${API_BASE}/api/status`);
  return res.json();
}

export async function fetchSessionScore(sessionId: string): Promise<SessionScore | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/score`);
    if (res.ok) {
      const data = await res.json();
      if (data.error) return null;
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchSessionFactory(sessionId: string): Promise<FactoryData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/factory`);
    if (res.ok) {
      const data = await res.json();
      if (data.error) return null;
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchSessionInventory(sessionId: string): Promise<InventoryData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/inventory`);
    if (res.ok) {
      const data = await res.json();
      if (data.error) return null;
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchSessionResearch(sessionId: string): Promise<ResearchData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/research`);
    if (res.ok) {
      const data = await res.json();
      if (data.error) return null;
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchSessionProduction(sessionId: string): Promise<ProductionData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/production`);
    if (res.ok) {
      const data = await res.json();
      if (data.error) return null;
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchSessionEntities(sessionId: string): Promise<EntitiesData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/entities`);
    if (res.ok) {
      const data = await res.json();
      if (data.error) return null;
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function getDownloadUrl(sessionId: string): string {
  return `${API_BASE}/api/session/${sessionId}/download`;
}

export async function fetchRunInfo(runId: string, baseUrl?: string): Promise<RunInfo | null> {
  try {
    const base = baseUrl || API_BASE;
    const res = await fetch(`${base}/api/runs/${runId}`, { cache: 'no-store' });
    if (res.ok) return res.json();
    return null;
  } catch {
    return null;
  }
}

export async function fetchRunSteps(
  runId: string,
  options?: { afterStepIdx?: number; limit?: number; baseUrl?: string },
): Promise<RunStepInfo[]> {
  try {
    const base = options?.baseUrl || API_BASE;
    const params = new URLSearchParams();
    if (options?.limit != null) params.set('limit', String(options.limit));
    if (options?.afterStepIdx != null) params.set('after_step_idx', String(options.afterStepIdx));
    const qs = params.toString();
    const res = await fetch(`${base}/api/runs/${runId}/steps${qs ? `?${qs}` : ''}`, { cache: 'no-store' });
    if (res.ok) return res.json();
    return [];
  } catch {
    return [];
  }
}

export async function createRun(body: {
  task_key?: string;
  model?: string;
  max_steps?: number;
  api_key?: string;
  custom_api_url?: string;
  custom_api_key?: string;
}): Promise<{ run_id: string; status: string; error?: string }> {
  const res = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || data.detail || `HTTP ${res.status}`);
  }
  return data;
}

export async function startWorker(runId: string): Promise<{ run_id: string; status: string } | null> {
  try {
    const res = await fetch(`/api/runs/${runId}/start-worker`, { method: 'POST' });
    if (res.ok) return res.json();
    return null;
  } catch {
    return null;
  }
}

export async function stopRun(runId: string): Promise<{ run_id: string; status: string } | null> {
  try {
    const res = await fetch(`/api/runs/${runId}/stop`, { method: 'POST' });
    if (res.ok) return res.json();
    return null;
  } catch {
    return null;
  }
}

export async function startReplay(
  runId: string,
  options?: {
    vtuber?: boolean;
    anthropicApiKey?: string;
    elevenLabsApiKey?: string;
    rtmpUrl?: string;
    streamKey?: string;
  },
): Promise<{ run_id: string; stream_url: string; vtuber_stream_url?: string | null } | null> {
  try {
    const params = new URLSearchParams();
    if (options?.vtuber != null) params.set('vtuber', String(options.vtuber));
    if (options?.rtmpUrl) params.set('rtmp_url', options.rtmpUrl);
    if (options?.streamKey) params.set('stream_key', options.streamKey);
    const qs = params.toString();

    const body: Record<string, string> = {};
    if (options?.anthropicApiKey) body.anthropic_api_key = options.anthropicApiKey;
    if (options?.elevenLabsApiKey) body.elevenlabs_api_key = options.elevenLabsApiKey;

    const res = await fetch(`/api/runs/${runId}/replay${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    return null;
  } catch {
    return null;
  }
}

export async function startReplayWorker(runId: string): Promise<{ run_id: string; status: string } | null> {
  try {
    const res = await fetch(`/api/runs/${runId}/replay/start-worker`, { method: 'POST' });
    if (res.ok) return res.json();
    return null;
  } catch {
    return null;
  }
}

export async function stopReplayWorker(runId: string): Promise<{ run_id: string; status: string } | null> {
  try {
    const res = await fetch(`/api/runs/${runId}/replay/start-worker`, { method: 'DELETE' });
    if (res.ok) return res.json();
    return null;
  } catch {
    return null;
  }
}

export async function stopReplay(runId: string): Promise<void> {
  try {
    await fetch(`/api/runs/${runId}/replay`, { method: 'DELETE' });
  } catch {
    // best-effort
  }
}

export async function fetchStreams(): Promise<StreamInfo[]> {
  try {
    const res = await fetch('/api/streams', { cache: 'no-store' });
    if (res.ok) return res.json();
    return [];
  } catch {
    return [];
  }
}
