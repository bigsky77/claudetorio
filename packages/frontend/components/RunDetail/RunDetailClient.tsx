'use client';

import { useState } from 'react';
import type { RunInfo, RunStepInfo } from '@/interfaces';
import { useRunPolling } from '@/hooks/use-run-polling';
import { stopRun, startReplay, startReplayWorker, stopReplay, stopReplayWorker } from '@/services/api';
import RunHeader from './RunHeader';
import StreamPanel from './StreamPanel';
import MatrixLogPanel from './MatrixLogPanel';

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
  const [replayWorkerStarted, setReplayWorkerStarted] = useState(false);

  async function handleStop() {
    await stopRun(run.run_id);
    await refetch();
  }

  async function handleStartReplay() {
    const result = await startReplay(run.run_id);
    if (result?.stream_url) {
      setReplayUrl(result.stream_url);
      setReplayWorkerStarted(false);
    }
  }

  async function handleStartReplayWorker() {
    const result = await startReplayWorker(run.run_id);
    if (result?.status === 'running') {
      setReplayWorkerStarted(true);
      await refetch();
    }
  }

  async function handleStopReplay() {
    await stopReplayWorker(run.run_id);
    await stopReplay(run.run_id);
    setReplayUrl(null);
    setReplayWorkerStarted(false);
  }

  return (
    <main className="relative h-screen w-full overflow-hidden text-white">
      {replayUrl ? (
        <StreamPanel streamUrl={replayUrl} mode="background" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-black" />
      )}

      <div className="relative z-10 h-full w-full p-4 lg:p-6 pointer-events-none">
        <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-4">
          <div className="pointer-events-auto">
            <RunHeader
              run={run}
              isActive={isActive}
              onStop={handleStop}
              onStartReplay={!replayUrl && run.step_count > 0 ? handleStartReplay : undefined}
              onStartReplayWorker={replayUrl && !replayWorkerStarted ? handleStartReplayWorker : undefined}
              onStopReplay={replayUrl ? handleStopReplay : undefined}
            />
          </div>

          <div className="flex flex-1 items-end lg:items-stretch">
            <div className="pointer-events-auto ml-auto w-full lg:max-w-[440px] lg:h-full">
              <MatrixLogPanel steps={steps} isActive={isActive} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
