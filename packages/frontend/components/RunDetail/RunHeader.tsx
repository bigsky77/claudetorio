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

interface VtuberFormBody {
  anthropic_api_key: string;
  elevenlabs_api_key: string;
  rtmp_url?: string;
  channel?: string;
  platform?: string;
}

function VtuberForm({ onSubmit, onCancel }: {
  onSubmit: (body: VtuberFormBody) => Promise<void>;
  onCancel: () => void;
}) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [rtmpUrl, setRtmpUrl] = useState('');
  const [channel, setChannel] = useState('');
  const [platform, setPlatform] = useState<'twitch' | 'kick'>('twitch');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      anthropic_api_key: anthropicKey,
      elevenlabs_api_key: elevenLabsKey,
      rtmp_url: rtmpUrl || undefined,
      channel: channel || undefined,
      platform: rtmpUrl ? platform : undefined,
    });
    setSubmitting(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-lg border border-white/10 bg-black/60 p-3 space-y-2 text-xs"
    >
      <div className="text-gray-300 font-semibold mb-1">Start VTuber Stream</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-gray-400">Anthropic API Key *</label>
          <input
            type="password"
            required
            value={anthropicKey}
            onChange={e => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-..."
            className="w-full rounded bg-zinc-900 border border-white/10 px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-400">ElevenLabs API Key *</label>
          <input
            type="password"
            required
            value={elevenLabsKey}
            onChange={e => setElevenLabsKey(e.target.value)}
            placeholder="sk_..."
            className="w-full rounded bg-zinc-900 border border-white/10 px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
        </div>
      </div>

      <div className="text-gray-500 text-[10px] pt-1">Optional: also stream to Twitch / Kick</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="space-y-1 sm:col-span-2">
          <label className="text-gray-400">RTMP URL (optional)</label>
          <input
            type="text"
            value={rtmpUrl}
            onChange={e => setRtmpUrl(e.target.value)}
            placeholder="rtmps://live.twitch.tv/app/live_..."
            className="w-full rounded bg-zinc-900 border border-white/10 px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
        </div>
        <div className="space-y-1">
          <label className="text-gray-400">Platform</label>
          <select
            value={platform}
            onChange={e => setPlatform(e.target.value as 'twitch' | 'kick')}
            className="w-full rounded bg-zinc-900 border border-white/10 px-2 py-1 text-white focus:outline-none focus:border-white/30"
          >
            <option value="twitch">Twitch</option>
            <option value="kick">Kick</option>
          </select>
        </div>
      </div>

      {rtmpUrl && (
        <div className="space-y-1">
          <label className="text-gray-400">Channel name (for embed)</label>
          <input
            type="text"
            value={channel}
            onChange={e => setChannel(e.target.value)}
            placeholder="claudetorio"
            className="w-full rounded bg-zinc-900 border border-white/10 px-2 py-1 text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
          />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1.5 bg-purple-700/90 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded font-medium transition-colors"
        >
          {submitting ? 'Starting...' : 'Start'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function RunHeader({
  run,
  isActive,
  onStop,
  onStartWorker,
  onStartReplay,
  onStartReplayWorker,
  onStopReplay,
  onStartVtuber,
  onStopVtuber,
}: {
  run: RunInfo;
  isActive?: boolean;
  onStop?: () => Promise<void>;
  onStartWorker?: () => Promise<void>;
  onStartReplay?: () => Promise<void>;
  onStartReplayWorker?: () => Promise<void>;
  onStopReplay?: () => Promise<void>;
  onStartVtuber?: (body: VtuberFormBody) => Promise<void>;
  onStopVtuber?: () => Promise<void>;
}) {
  const badgeClass = STATUS_COLORS[run.status] ?? 'bg-gray-700 text-gray-300';
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startingReplay, setStartingReplay] = useState(false);
  const [startingReplayWorker, setStartingReplayWorker] = useState(false);
  const [stoppingReplay, setStoppingReplay] = useState(false);
  const [stoppingVtuber, setStoppingVtuber] = useState(false);
  const [showVtuberForm, setShowVtuberForm] = useState(false);

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

  async function handleStartVtuber(body: VtuberFormBody) {
    if (!onStartVtuber) return;
    await onStartVtuber(body);
    setShowVtuberForm(false);
  }

  async function handleStopVtuber() {
    if (!onStopVtuber) return;
    setStoppingVtuber(true);
    await onStopVtuber();
    setStoppingVtuber(false);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/45 p-3 backdrop-blur-md shadow-2xl">
      {/* Back link + title */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/"
          className="text-gray-300 hover:text-white transition-colors text-sm"
        >
          &larr; Back
        </Link>
        <h1 className="text-base sm:text-lg font-semibold font-mono truncate max-w-[24rem]">
          {run.run_id}
        </h1>
        <span className={`px-2 py-1 text-[11px] rounded font-medium uppercase tracking-wide ${badgeClass}`}>
          {run.status}
        </span>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {onStartWorker && (
            <button
              onClick={handleStartWorker}
              disabled={starting}
              className="px-3 py-1.5 bg-green-700/90 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs sm:text-sm font-medium transition-colors"
            >
              {starting ? 'Starting...' : 'Start Worker'}
            </button>
          )}
          {isActive && onStop && !onStartWorker && (
            <button
              onClick={handleStop}
              disabled={stopping}
              className="px-3 py-1.5 bg-red-700/90 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs sm:text-sm font-medium transition-colors"
            >
              {stopping ? 'Stopping...' : 'Stop Run'}
            </button>
          )}
          {onStopReplay && (
            <button
              onClick={handleStopReplay}
              disabled={stoppingReplay}
              className="px-3 py-1.5 bg-orange-700/90 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs sm:text-sm font-medium transition-colors"
            >
              {stoppingReplay ? 'Stopping...' : 'Stop Stream'}
            </button>
          )}
          {onStartReplay && !onStopReplay && (
            <button
              onClick={handleStartReplay}
              disabled={startingReplay}
              className="px-3 py-1.5 bg-blue-700/90 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs sm:text-sm font-medium transition-colors"
            >
              {startingReplay ? 'Starting...' : 'Watch Replay'}
            </button>
          )}
          {onStartReplayWorker && (
            <button
              onClick={handleStartReplayWorker}
              disabled={startingReplayWorker}
              className="px-3 py-1.5 bg-indigo-700/90 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs sm:text-sm font-medium transition-colors"
            >
              {startingReplayWorker ? 'Starting...' : 'Start Replay Worker'}
            </button>
          )}
          {onStartVtuber && !showVtuberForm && (
            <button
              onClick={() => setShowVtuberForm(true)}
              className="px-3 py-1.5 bg-purple-700/90 hover:bg-purple-600 rounded text-xs sm:text-sm font-medium transition-colors"
            >
              Go Live
            </button>
          )}
          {onStopVtuber && (
            <button
              onClick={handleStopVtuber}
              disabled={stoppingVtuber}
              className="px-3 py-1.5 bg-pink-700/90 hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs sm:text-sm font-medium transition-colors"
            >
              {stoppingVtuber ? 'Stopping...' : 'Stop VTuber'}
            </button>
          )}
        </div>
      </div>

      {/* Metadata cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
        <div className="bg-red-900/40 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-sm">
          <span className="font-semibold">Error: </span>
          {run.error}
        </div>
      )}

      {/* VTuber credential form */}
      {showVtuberForm && onStartVtuber && (
        <VtuberForm
          onSubmit={handleStartVtuber}
          onCancel={() => setShowVtuberForm(false)}
        />
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/35 px-2.5 py-2">
      <div className="text-[10px] text-gray-400 uppercase tracking-widest">{label}</div>
      <div className="text-xs sm:text-sm font-medium text-gray-100 mt-1 truncate">
        {value}
      </div>
    </div>
  );
}
