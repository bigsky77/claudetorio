'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { RunInfo } from '@/interfaces';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-green-900/50 text-green-400',
  waiting: 'bg-yellow-900/50 text-yellow-400',
  queued: 'bg-yellow-900/50 text-yellow-400',
  completed: 'bg-blue-900/50 text-blue-400',
  failed: 'bg-red-900/50 text-red-400',
  stopped: 'bg-gray-700 text-gray-400',
};

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '-';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const secs = Math.floor((e - s) / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const sec = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function RunHeader({
  run,
  isActive,
  onStop,
  onStartWorker,
  onStartReplay,
  onStartReplayWorker,
  onStopReplay,
}: {
  run: RunInfo;
  isActive?: boolean;
  onStop?: () => Promise<void>;
  onStartWorker?: () => Promise<void>;
  onStartReplay?: () => Promise<void>;
  onStartReplayWorker?: () => Promise<void>;
  onStopReplay?: () => Promise<void>;
}) {
  const badgeClass = STATUS_COLORS[run.status] ?? 'bg-gray-700 text-gray-300';
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startingReplay, setStartingReplay] = useState(false);
  const [startingReplayWorker, setStartingReplayWorker] = useState(false);
  const [stoppingReplay, setStoppingReplay] = useState(false);

  async function handleStop() {
    if (!onStop) return;
    setStopping(true);
    await onStop();
    setStopping(false);
  }

  async function handleStartWorker() {
    if (!onStartWorker) return;
    setStarting(true);
    await onStartWorker();
    setStarting(false);
  }

  async function handleStartReplay() {
    if (!onStartReplay) return;
    setStartingReplay(true);
    await onStartReplay();
    setStartingReplay(false);
  }

  async function handleStopReplay() {
    if (!onStopReplay) return;
    setStoppingReplay(true);
    await onStopReplay();
    setStoppingReplay(false);
  }

  async function handleStartReplayWorker() {
    if (!onStartReplayWorker) return;
    setStartingReplayWorker(true);
    await onStartReplayWorker();
    setStartingReplayWorker(false);
  }

  return (
    <div className="space-y-4">
      {/* Back link + title */}
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          &larr; Back
        </Link>
        <h1 className="text-2xl font-bold font-mono truncate">{run.run_id}</h1>
        <span className={`px-2 py-1 text-xs rounded font-medium ${badgeClass}`}>
          {run.status}
        </span>
        <div className="ml-auto flex gap-2">
          {onStartWorker && (
            <button
              onClick={handleStartWorker}
              disabled={starting}
              className="px-4 py-1.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
            >
              {starting ? 'Starting...' : 'Start Worker'}
            </button>
          )}
          {isActive && onStop && !onStartWorker && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="px-4 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
            >
              {stopping ? 'Stopping...' : 'Stop Run'}
            </button>
          )}
          {onStopReplay && (
            <button
              onClick={handleStopReplay}
              disabled={stoppingReplay}
              className="px-4 py-1.5 bg-orange-700 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
            >
              {stoppingReplay ? 'Stopping...' : 'Stop Stream'}
            </button>
          )}
          {onStartReplay && !onStopReplay && (
            <button
              onClick={handleStartReplay}
              disabled={startingReplay}
              className="px-4 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
            >
              {startingReplay ? 'Starting...' : 'Watch Replay'}
            </button>
          )}
          {onStartReplayWorker && (
            <button
              onClick={handleStartReplayWorker}
              disabled={startingReplayWorker}
              className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
            >
              {startingReplayWorker ? 'Starting...' : 'Start Replay Worker'}
            </button>
          )}
        </div>
      </div>

      {/* Metadata cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card label="Model" value={run.model} />
        <Card label="Task" value={run.task_key} />
        <Card
          label="Steps"
          value={`${run.step_count} / ${run.max_steps}`}
        />
        <Card
          label="Score"
          value={run.final_score != null ? run.final_score.toLocaleString() : '-'}
        />
        <Card
          label="Duration"
          value={formatDuration(run.started_at, run.ended_at)}
        />
        <Card label="Slot" value={run.slot != null ? String(run.slot) : '-'} />
      </div>

      {/* Error banner */}
      {run.error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-400 text-sm">
          <span className="font-semibold">Error: </span>
          {run.error}
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-gray-200 mt-1 truncate">
        {value}
      </div>
    </div>
  );
}
