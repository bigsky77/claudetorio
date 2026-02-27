'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { fetchLiveRun, fetchRunSteps } from '@/services/api';
import type { RunInfo, RunStepInfo } from '@/interfaces';
import ChatPanel from '@/components/Chat/ChatPanel';
import MatrixLogPanel, { RuntimeDisplayPayload } from '@/components/RunDetail/MatrixLogPanel';

const AVATAR_URL = process.env.NEXT_PUBLIC_AVATAR_URL || '';

// ---------------------------------------------------------------------------
// HLS background video — fills the entire screen behind all overlays
// ---------------------------------------------------------------------------

function HlsBackground({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const url = src.replace(/\/$/, '') + '/stream.m3u8';
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({ liveSyncDurationCount: 2, maxBufferLength: 8 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
    }

    return () => { hls?.destroy(); };
  }, [src]);

  return (
    <div className="absolute inset-0">
      <video
        ref={videoRef}
        className="w-full h-full bg-black object-cover"
        autoPlay
        muted
        playsInline
      />
      {/* Slight darken so overlaid text is readable */}
      <div className="pointer-events-none absolute inset-0 bg-black/40" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step polling hook (lighter than useRunPolling — no initial SSR fetch)
// ---------------------------------------------------------------------------

function useLiveSteps(runId: string | null) {
  const [steps, setSteps] = useState<RunStepInfo[]>([]);
  const maxIdxRef = useRef(-1);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    async function poll() {
      const batch = await fetchRunSteps(runId!, {
        afterStepIdx: maxIdxRef.current,
        limit: 50,
      });
      if (cancelled || batch.length === 0) return;
      maxIdxRef.current = Math.max(...batch.map((s) => s.step_idx));
      setSteps((prev) => [...prev, ...batch]);
    }

    // Initial catch-up
    poll();
    const id = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [runId]);

  return steps;
}

// ---------------------------------------------------------------------------
// Main LiveView
// ---------------------------------------------------------------------------

export default function LiveView() {
  const [run, setRun] = useState<RunInfo | null>(null);
  const [error, setError] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const steps = useLiveSteps(run?.run_id ?? null);

  // Runtime display overlay (code/result text that fades in/out)
  const [runtimeDisplay, setRuntimeDisplay] = useState<{
    text: string;
    tone: RuntimeDisplayPayload['tone'];
    fadeMode: RuntimeDisplayPayload['fadeMode'];
    displayKey: number;
  } | null>(null);

  const handleDisplayChange = useCallback((payload: RuntimeDisplayPayload) => {
    setRuntimeDisplay((prev) => ({
      text: payload.text,
      tone: payload.tone,
      fadeMode: payload.fadeMode,
      displayKey: (prev?.displayKey ?? 0) + 1,
    }));
  }, []);

  // Poll for the live run
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const r = await fetchLiveRun();
      if (cancelled) return;
      setRun(r);
      setError(!r);
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ---- No live run states ----
  if (!run) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="text-white/30 text-lg font-mono tracking-wide">
          {error ? 'NO LIVE RUN. WAITING...' : 'CONNECTING...'}
        </div>
      </div>
    );
  }

  // ---- Live run layout: video bg + overlays + chat sidebar ----
  return (
    <div className="h-screen w-screen bg-black flex">
      {/* Stream + overlays region */}
      <div className="flex-1 min-w-0 relative overflow-hidden">
        {/* Layer 0: HLS video background */}
        {run.stream_url ? (
          <HlsBackground src={run.stream_url} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-black" />
        )}

        {/* Layer 1: All overlays on top of the video */}
        <div className="relative z-10 h-full w-full pointer-events-none">
          <div className="relative h-full p-4 lg:p-6">
            {/* Top bar — run info */}
            <div className="pointer-events-auto inline-flex items-center gap-3 rounded-xl border border-white/10 bg-black/50 backdrop-blur-md px-4 py-2">
              <a href="/" className="font-bold text-sm tracking-wide text-white/80 hover:text-white">
                CLAUDETORIO
              </a>
              <span className="bg-green-500 text-black font-bold px-1.5 py-0.5 text-[10px] uppercase rounded">
                LIVE
              </span>
              <span className="text-xs text-white/50">{run.model}</span>
              <span className="text-xs text-white/50">
                step {run.step_count}/{run.max_steps}
              </span>
              {run.final_score != null && (
                <span className="text-xs text-white/50">score {run.final_score}</span>
              )}
              <a
                href={`/run/${run.run_id}`}
                className="text-xs text-green-400/70 hover:text-green-400 underline pointer-events-auto"
              >
                details
              </a>
            </div>

            {/* Code/result overlay text (fades in/out) */}
            {runtimeDisplay && (
              <pre
                key={runtimeDisplay.displayKey}
                className={`runtime-overlay-text ${
                  runtimeDisplay.fadeMode === 'slow' ? 'runtime-fade-slow' : 'runtime-fade-normal'
                } ${
                  runtimeDisplay.tone === 'error' ? 'text-red-300' : 'text-emerald-300'
                }`}
              >
                {runtimeDisplay.text}
              </pre>
            )}

            {/* Bottom-left: MatrixLogPanel (step selector + code/result tabs) */}
            <div className="pointer-events-auto absolute bottom-4 left-4 lg:bottom-6 lg:left-6">
              <div className="w-[290px] sm:w-[360px]">
                <MatrixLogPanel
                  steps={steps}
                  onDisplayChange={handleDisplayChange}
                />
              </div>
            </div>

            {/* Bottom-right: VTuber avatar overlay */}
            {AVATAR_URL && (
              <div className="absolute bottom-0 right-0 w-[600px] h-[400px] overflow-hidden z-10 -mr-[100px]">
                <iframe
                  ref={iframeRef}
                  src={AVATAR_URL}
                  className="w-[600px] h-[600px] border-none"
                  style={{ transform: 'scale(2)', transformOrigin: 'top center' }}
                  allow="autoplay; speaker; microphone"
                />
              </div>
            )}

            {/* Click-to-enable-audio button */}
            {AVATAR_URL && !audioEnabled && (
              <button
                className="pointer-events-auto absolute top-4 right-4 lg:top-6 lg:right-[360px] z-20 flex items-center gap-2 rounded-lg border border-white/20 bg-black/60 backdrop-blur-md px-3 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/40 transition-all"
                onClick={() => {
                  setAudioEnabled(true);
                  iframeRef.current?.contentWindow?.postMessage({ type: 'enable-audio' }, '*');
                }}
              >
                <span className="text-base">🔇</span> Click to enable sound
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat sidebar — desktop only */}
      <aside className="hidden lg:flex w-[340px] shrink-0 border-l border-white/10 bg-black/60 backdrop-blur-sm">
        <ChatPanel streamId="live" />
      </aside>
    </div>
  );
}
