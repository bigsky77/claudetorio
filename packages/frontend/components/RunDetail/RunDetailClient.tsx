'use client';

import { useState } from 'react';
import type { RunInfo, RunStepInfo } from '@/interfaces';
import { useRunPolling } from '@/hooks/use-run-polling';
import { startRunStream, stopRun } from '@/services/api';
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
  const [startingStream, setStartingStream] = useState(false);
  const streamUrl = run.stream_url ?? initialStreamUrl;
  const showStream = isActive && Boolean(streamUrl);
  const canStartStream = isActive && run.slot != null && !showStream;

  async function handleStop() {
    await stopRun(run.run_id);
    await refetch();
  }

  async function handleStartStream() {
    setStartingStream(true);
    await startRunStream(run.run_id);
    await refetch();
    setStartingStream(false);
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <RunHeader run={run} isActive={isActive} onStop={handleStop} />

        {canStartStream && (
          <div className="flex justify-start">
            <button
              onClick={handleStartStream}
              disabled={startingStream}
              className="px-4 py-2 rounded bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              {startingStream ? 'Starting Stream...' : 'Start Stream'}
            </button>
          </div>
        )}

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
