'use client';

import { useEffect, useState } from 'react';
import type { RunInfo, RunStepInfo } from '@/interfaces';
import { useRunPolling } from '@/hooks/use-run-polling';
import { stopRun, startReplay, startReplayWorker, stopReplay } from '@/services/api';
import RunHeader from './RunHeader';
import RunChart from './RunChart';
import StreamPanel from './StreamPanel';
import StepList from './StepList';

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
  const [replayWorkerRunning, setReplayWorkerRunning] = useState<boolean>(Boolean(run.replay_worker_running));

  const showStream = Boolean(replayUrl);

  useEffect(() => {
    if (run.replay_worker_running != null) {
      setReplayWorkerRunning(Boolean(run.replay_worker_running));
    }
  }, [run.replay_worker_running]);

  async function handleStop() {
    await stopRun(run.run_id);
    await refetch();
  }

  async function handleStartReplay() {
    const result = await startReplay(run.run_id);
    if (result?.stream_url) {
      setReplayUrl(result.stream_url);
      setReplayWorkerRunning(false);
    }
  }

  async function handleStartReplayWorker() {
    const result = await startReplayWorker(run.run_id);
    if (result?.status === 'running') {
      setReplayWorkerRunning(true);
      await refetch();
    }
  }

  async function handleStopReplay() {
    await stopReplay(run.run_id);
    setReplayUrl(null);
    setReplayWorkerRunning(false);
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <RunHeader
          run={run}
          isActive={isActive}
          onStop={handleStop}
          onStartReplay={!replayUrl && run.step_count > 0 ? handleStartReplay : undefined}
          onStartReplayWorker={replayUrl && !replayWorkerRunning ? handleStartReplayWorker : undefined}
          onStopReplay={replayUrl ? handleStopReplay : undefined}
        />

        {/* Stream + Chart row */}
        <div
          className={
            showStream
              ? 'grid grid-cols-1 lg:grid-cols-2 gap-4'
              : ''
          }
        >
          {showStream && <StreamPanel streamUrl={replayUrl!} />}
          <RunChart steps={steps} />
        </div>

        {/* Step list */}
        <StepList steps={steps} isActive={isActive} />
      </div>
    </main>
  );
}
