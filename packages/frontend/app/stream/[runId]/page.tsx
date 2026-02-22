'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchRunInfo, startReplay, startReplayWorker, stopReplay } from '@/services/api';
import type { RunInfo } from '@/interfaces';

declare global {
  interface Window {
    Hls: {
      isSupported: () => boolean;
      new (config?: Record<string, unknown>): HlsInstance;
      Events: { MANIFEST_PARSED: string; ERROR: string };
    };
  }
}

interface HlsInstance {
  loadSource(src: string): void;
  attachMedia(el: HTMLVideoElement): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  destroy(): void;
}

type ReplayState = 'idle' | 'starting' | 'live' | 'stopping';

const STORAGE_KEY = 'claudetorio.vtuber';

function loadSavedKeys() {
  if (typeof window === 'undefined') return { anthropicKey: '', elevenLabsKey: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      anthropicKey: saved.anthropicKey || '',
      elevenLabsKey: saved.elevenLabsKey || '',
    };
  } catch {
    return { anthropicKey: '', elevenLabsKey: '' };
  }
}

function saveKeys(anthropicKey: string, elevenLabsKey: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ anthropicKey, elevenLabsKey }));
  } catch { /* ignore */ }
}

export default function StreamViewerPage() {
  const { runId } = useParams<{ runId: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);

  const [run, setRun] = useState<RunInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [replayState, setReplayState] = useState<ReplayState>('idle');

  // API key form state
  const [anthropicKey, setAnthropicKey] = useState('');
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showElevenLabsKey, setShowElevenLabsKey] = useState(false);

  // Load saved keys from localStorage on mount
  useEffect(() => {
    const { anthropicKey: ak, elevenLabsKey: ek } = loadSavedKeys();
    setAnthropicKey(ak);
    setElevenLabsKey(ek);
  }, []);

  // Poll run info
  useEffect(() => {
    let mounted = true;
    async function loadRun() {
      const data = await fetchRunInfo(runId);
      if (!mounted) return;
      if (!data) {
        router.push('/');
        return;
      }
      setRun(data);
      setLoading(false);
    }
    loadRun();
    const interval = setInterval(loadRun, 5_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [runId, router]);

  // Sync stream URL from run info
  useEffect(() => {
    if (!run) return;
    const src = run.vtuber_stream_url || run.stream_url;
    if (src) {
      const m3u8 = src.endsWith('/') ? `${src}stream.m3u8` : `${src}/stream.m3u8`;
      setStreamSrc(prev => prev === m3u8 ? prev : m3u8);
      setReplayState(prev => (prev === 'idle' || prev === 'starting') ? 'live' : prev);
    } else if (!src && replayState === 'live') {
      // Replay was stopped externally
      setStreamSrc(null);
      setReplayState('idle');
    }
  }, [run]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize HLS player
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamSrc) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const initPlayer = () => {
      const Hls = window.Hls;
      if (Hls && Hls.isSupported()) {
        const hls = new Hls({ liveSyncDurationCount: 3, maxBufferLength: 20 });
        hls.loadSource(streamSrc);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (...args: unknown[]) => {
          const data = args[1] as { fatal?: boolean } | undefined;
          if (data?.fatal) {
            setTimeout(() => hls.loadSource(streamSrc), 3000);
          }
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamSrc;
        video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
      }
    };

    if (window.Hls) {
      initPlayer();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
      script.onload = initPlayer;
      document.head.appendChild(script);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamSrc]);

  async function handleStartVtuber() {
    saveKeys(anthropicKey, elevenLabsKey);
    setReplayState('starting');
    const result = await startReplay(runId, {
      vtuber: true,
      anthropicApiKey: anthropicKey || undefined,
      elevenLabsApiKey: elevenLabsKey || undefined,
    });
    if (!result) {
      setReplayState('idle');
      return;
    }
    await startReplayWorker(runId);
    const src = result.vtuber_stream_url || result.stream_url;
    if (src) {
      setStreamSrc(src.endsWith('/') ? `${src}stream.m3u8` : `${src}/stream.m3u8`);
    }
    setReplayState('live');
  }

  async function handleStartPlain() {
    setReplayState('starting');
    const result = await startReplay(runId, { vtuber: false });
    if (!result) {
      setReplayState('idle');
      return;
    }
    await startReplayWorker(runId);
    const src = result.stream_url;
    if (src) {
      setStreamSrc(src.endsWith('/') ? `${src}stream.m3u8` : `${src}/stream.m3u8`);
    }
    setReplayState('live');
  }

  async function handleStop() {
    setReplayState('stopping');
    await stopReplay(runId);
    setStreamSrc(null);
    setReplayState('idle');
  }

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={{ color: 'rgba(180, 160, 220, 0.5)', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  const modelShort = run?.model.split('/').pop() ?? run?.model ?? '';
  const isLiveReplay = run?.replay_worker_running;
  const hasVtuber = Boolean(run?.vtuber_stream_url);

  return (
    <div style={{ minHeight: '100vh', background: '#060412', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button onClick={() => router.push('/')} style={styles.backBtn}>← Back</button>
        <div style={styles.divider} />
        <span style={styles.modelName}>{modelShort}</span>

        {isLiveReplay && (
          <span style={styles.badgeLive}>LIVE REPLAY</span>
        )}
        {hasVtuber && (
          <span style={styles.badgeVtuber}>🎭 VTuber + Narration</span>
        )}

        <div style={{ flex: 1 }} />

        {run && (
          <span style={styles.metaText}>
            {run.step_count} steps
            {run.final_score != null && ` · Score: ${run.final_score.toFixed(1)}`}
          </span>
        )}

        {replayState === 'live' && (
          <button onClick={handleStop} style={styles.stopBtn} disabled={replayState !== 'live'}>
            Stop Replay
          </button>
        )}
      </div>

      {/* Main content */}
      <div style={styles.main}>
        {(replayState === 'live' || replayState === 'stopping') && streamSrc ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            controls
            style={styles.video}
          />
        ) : replayState === 'starting' ? (
          <StartingCard />
        ) : replayState === 'stopping' ? (
          <StoppingCard />
        ) : (
          <IdleCard
            anthropicKey={anthropicKey}
            elevenLabsKey={elevenLabsKey}
            showAnthropicKey={showAnthropicKey}
            showElevenLabsKey={showElevenLabsKey}
            onAnthropicChange={setAnthropicKey}
            onElevenLabsChange={setElevenLabsKey}
            onToggleAnthropic={() => setShowAnthropicKey(v => !v)}
            onToggleElevenLabs={() => setShowElevenLabsKey(v => !v)}
            onStartVtuber={handleStartVtuber}
            onStartPlain={handleStartPlain}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function IdleCard({
  anthropicKey, elevenLabsKey,
  showAnthropicKey, showElevenLabsKey,
  onAnthropicChange, onElevenLabsChange,
  onToggleAnthropic, onToggleElevenLabs,
  onStartVtuber, onStartPlain,
}: {
  anthropicKey: string; elevenLabsKey: string;
  showAnthropicKey: boolean; showElevenLabsKey: boolean;
  onAnthropicChange: (v: string) => void; onElevenLabsChange: (v: string) => void;
  onToggleAnthropic: () => void; onToggleElevenLabs: () => void;
  onStartVtuber: () => void; onStartPlain: () => void;
}) {
  return (
    <div style={styles.card}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎭</div>
      <h2 style={styles.cardTitle}>Start Replay</h2>
      <p style={styles.cardSubtitle}>
        Watch the Factorio replay with AI commentary and avatar narration.
      </p>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>Anthropic API Key</label>
        <div style={styles.inputWrap}>
          <input
            type={showAnthropicKey ? 'text' : 'password'}
            value={anthropicKey}
            onChange={e => onAnthropicChange(e.target.value)}
            placeholder="sk-ant-..."
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={onToggleAnthropic} style={styles.eyeBtn} title="Toggle visibility">
            {showAnthropicKey ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      <div style={styles.fieldGroup}>
        <label style={styles.label}>ElevenLabs API Key</label>
        <div style={styles.inputWrap}>
          <input
            type={showElevenLabsKey ? 'text' : 'password'}
            value={elevenLabsKey}
            onChange={e => onElevenLabsChange(e.target.value)}
            placeholder="sk_..."
            style={styles.input}
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={onToggleElevenLabs} style={styles.eyeBtn} title="Toggle visibility">
            {showElevenLabsKey ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      <div style={styles.btnRow}>
        <button onClick={onStartVtuber} style={styles.primaryBtn}>
          🎭 Start VTuber Replay
        </button>
        <button onClick={onStartPlain} style={styles.secondaryBtn}>
          Plain Replay
        </button>
      </div>

      <p style={styles.hint}>
        Keys are saved in your browser and only sent when starting a replay.<br />
        VTuber replay requires both keys. Plain replay needs neither.
      </p>
    </div>
  );
}

function StartingCard() {
  return (
    <div style={styles.card}>
      <div style={{ fontSize: 40, marginBottom: 16, animation: 'spin 2s linear infinite' }}>⟳</div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <h2 style={styles.cardTitle}>Spinning up stream...</h2>
      <p style={styles.cardSubtitle}>
        Docker containers are starting. This takes about 30 seconds.<br />
        The video will appear automatically once the stream is ready.
      </p>
    </div>
  );
}

function StoppingCard() {
  return (
    <div style={styles.card}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⏹</div>
      <h2 style={styles.cardTitle}>Stopping replay...</h2>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: {
    minHeight: '100vh',
    background: '#060412',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(180, 160, 220, 0.5)',
    fontSize: 14,
  } as React.CSSProperties,

  toolbar: {
    height: 48,
    background: '#0a0820',
    borderBottom: '1px solid rgba(120, 80, 200, 0.2)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: 16,
    flexShrink: 0,
  } as React.CSSProperties,

  backBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(180, 160, 220, 0.6)',
    cursor: 'pointer',
    fontSize: 13,
    padding: '4px 8px',
  } as React.CSSProperties,

  divider: {
    width: 1,
    height: 20,
    background: 'rgba(120, 80, 200, 0.3)',
  } as React.CSSProperties,

  modelName: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e0d0ff',
  } as React.CSSProperties,

  badgeLive: {
    background: '#e74c3c',
    color: '#fff',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 3,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  } as React.CSSProperties,

  badgeVtuber: {
    background: 'rgba(80, 40, 140, 0.6)',
    color: '#c8a8f0',
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 3,
  } as React.CSSProperties,

  metaText: {
    fontSize: 11,
    color: 'rgba(180, 160, 220, 0.45)',
  } as React.CSSProperties,

  stopBtn: {
    background: 'rgba(180, 40, 40, 0.3)',
    border: '1px solid rgba(200, 60, 60, 0.4)',
    color: '#f08080',
    cursor: 'pointer',
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 4,
  } as React.CSSProperties,

  main: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#000',
  } as React.CSSProperties,

  video: {
    maxWidth: '100%',
    maxHeight: 'calc(100vh - 48px)',
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  } as React.CSSProperties,

  card: {
    background: '#0d0a1e',
    border: '1px solid rgba(120, 80, 200, 0.25)',
    borderRadius: 12,
    padding: '40px 48px',
    maxWidth: 460,
    width: '100%',
    textAlign: 'center',
    margin: 24,
  } as React.CSSProperties,

  cardTitle: {
    color: '#c8a8f0',
    fontSize: 20,
    fontWeight: 700,
    margin: '0 0 8px',
  } as React.CSSProperties,

  cardSubtitle: {
    color: 'rgba(180, 160, 220, 0.5)',
    fontSize: 13,
    margin: '0 0 28px',
    lineHeight: 1.5,
  } as React.CSSProperties,

  fieldGroup: {
    textAlign: 'left',
    marginBottom: 16,
  } as React.CSSProperties,

  label: {
    display: 'block',
    fontSize: 12,
    color: 'rgba(180, 160, 220, 0.7)',
    marginBottom: 6,
    fontWeight: 500,
  } as React.CSSProperties,

  inputWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties,

  input: {
    width: '100%',
    background: '#0a0820',
    border: '1px solid rgba(120, 80, 200, 0.3)',
    borderRadius: 6,
    color: '#e0d0ff',
    fontSize: 13,
    padding: '8px 40px 8px 12px',
    outline: 'none',
    fontFamily: 'monospace',
  } as React.CSSProperties,

  eyeBtn: {
    position: 'absolute',
    right: 10,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    padding: 0,
    lineHeight: 1,
    opacity: 0.6,
  } as React.CSSProperties,

  btnRow: {
    display: 'flex',
    gap: 12,
    marginTop: 28,
    marginBottom: 16,
  } as React.CSSProperties,

  primaryBtn: {
    flex: 1,
    background: 'rgba(100, 50, 180, 0.5)',
    border: '1px solid rgba(140, 80, 220, 0.5)',
    borderRadius: 6,
    color: '#e0d0ff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    padding: '10px 16px',
  } as React.CSSProperties,

  secondaryBtn: {
    background: 'rgba(40, 30, 70, 0.6)',
    border: '1px solid rgba(120, 80, 200, 0.25)',
    borderRadius: 6,
    color: 'rgba(180, 160, 220, 0.7)',
    cursor: 'pointer',
    fontSize: 13,
    padding: '10px 16px',
    whiteSpace: 'nowrap',
  } as React.CSSProperties,

  hint: {
    fontSize: 11,
    color: 'rgba(180, 160, 220, 0.3)',
    lineHeight: 1.6,
    margin: 0,
  } as React.CSSProperties,
} as const;
