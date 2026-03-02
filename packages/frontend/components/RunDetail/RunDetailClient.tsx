'use client';

import { useCallback, useState } from 'react';
import type { RunInfo, RunStepInfo } from '@/interfaces';
import { useRunPolling } from '@/hooks/use-run-polling';
import { stopRun, startReplay, startReplayWorker, stopReplay, stopReplayWorker, startRtmp, stopRtmp } from '@/services/api';
import RunHeader from './RunHeader';
import StreamPanel from './StreamPanel';
import MatrixLogPanel, { RuntimeDisplayPayload } from './MatrixLogPanel';

export default function RunDetailClient({
  initialRun,
  initialSteps,
  streamUrl: initialStreamUrl,
}: {
  initialRun: RunInfo;
  initialSteps: RunStepInfo[];
  streamUrl: string;
}) {
  const { run, steps, isActive, refetch } = useRunPolling(initialRun, initialSteps);
  const [replayUrl, setReplayUrl] = useState<string | null>(run.stream_url ?? initialStreamUrl ?? null);
  const [isLive, setIsLive] = useState(run.rtmp_active ?? false);
  const [runtimeDisplay, setRuntimeDisplay] = useState<{
    text: string;
    tone: RuntimeDisplayPayload['tone'];
    fadeMode: RuntimeDisplayPayload['fadeMode'];
    displayKey: number;
  } | null>(null);

  async function handleStop() {
    await stopRun(run.run_id);
    await refetch();
  }

  async function handleStartReplay() {
    const result = await startReplay(run.run_id);
    if (result?.stream_url) {
      setReplayUrl(result.stream_url);
    }
  }

  async function handleStartReplayWorker() {
    const result = await startReplayWorker(run.run_id);
    if (result?.status === 'running') {
      await refetch();
    }
  }

  async function handleStopReplay() {
    await stopReplayWorker(run.run_id);
    await stopReplay(run.run_id);
    setReplayUrl(null);
    setIsLive(false);
  }

  async function handleGoLive() {
    const ok = await startRtmp(run.run_id);
    if (ok) setIsLive(true);
  }

  async function handleStopLive() {
    await stopRtmp(run.run_id);
    setIsLive(false);
  }

  const handleDisplayChange = useCallback((payload: RuntimeDisplayPayload) => {
    setRuntimeDisplay((prev) => ({
      text: payload.text,
      tone: payload.tone,
      fadeMode: payload.fadeMode,
      displayKey: (prev?.displayKey ?? 0) + 1,
    }));
  }, []);

  return (
    <main className="relative h-screen w-full overflow-hidden text-white">
      {replayUrl ? (
        <StreamPanel streamUrl={replayUrl} mode="background" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-black" />
      )}

      <div className="relative z-10 h-full w-full pointer-events-none">
        <div className="relative mx-auto h-full max-w-[1600px] p-4 lg:p-6">
          <div className="pointer-events-auto">
            <RunHeader
              run={run}
              isActive={isActive}
              onStop={handleStop}
              onStartReplay={!replayUrl && run.step_count > 0 ? handleStartReplay : undefined}
              onStartReplayWorker={replayUrl ? handleStartReplayWorker : undefined}
              onStopReplay={replayUrl ? handleStopReplay : undefined}
              onGoLive={replayUrl && !isLive ? handleGoLive : undefined}
              onStopLive={isLive ? handleStopLive : undefined}
            />
          </div>

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

          <div className="pointer-events-auto absolute bottom-4 left-4 lg:bottom-6 lg:left-6">
            <div className="w-[290px] sm:w-[360px]">
              <MatrixLogPanel
                steps={steps}
                onDisplayChange={handleDisplayChange}
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
