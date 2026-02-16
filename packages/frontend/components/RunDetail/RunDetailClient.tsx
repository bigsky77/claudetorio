'use client';

import type { RunInfo, RunStepInfo } from '@/interfaces';
import { useRunPolling } from '@/hooks/use-run-polling';
import { stopRun, startWorker } from '@/services/api';
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
  const streamUrl = run.stream_url ?? initialStreamUrl;
  const showStream = isActive && Boolean(streamUrl);

  async function handleStop() {
    await stopRun(run.run_id);
    await refetch();
  }

  async function handleStartWorker() {
    await startWorker(run.run_id);
    await refetch();
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <RunHeader run={run} isActive={isActive} onStop={handleStop} onStartWorker={run.status === 'waiting' ? handleStartWorker : undefined} />

        {/* Stream + Chart row */}
        <div
          className={
            showStream
              ? 'grid grid-cols-1 lg:grid-cols-2 gap-4'
              : ''
          }
        >
          {showStream && <StreamPanel streamUrl={streamUrl} />}
          <RunChart steps={steps} />
        </div>

        {/* Step list */}
        <StepList steps={steps} isActive={isActive} />
      </div>
    </main>
  );
}
