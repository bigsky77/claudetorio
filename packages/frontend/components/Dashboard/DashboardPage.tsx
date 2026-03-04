'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import NavHeader from '@/components/NavHeader';
import { useAuth } from '@/contexts/AuthContext';
import { REFRESH_INTERVAL_MS } from '@/constants';
import type { RunInfo, SystemStatus } from '@/interfaces';
import {
  fetchRuns,
  fetchStatus,
  fetchOpsSummary,
  startReplay,
  stopReplay,
  startReplayWorker,
  stopReplayWorker,
  startRtmp,
  stopRtmp,
  stopRun,
  startWorker,
} from '@/services/api';

import NewRunDrawer from './NewRunDrawer';

function formatAge(iso: string | null): string {
  if (!iso) return '—';
  const created = new Date(iso).getTime();
  if (Number.isNaN(created)) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - created) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function formatCompactNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${Math.round(n / 1_000)}k`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

function statusPill(status: string): { cls: string; label: string } {
  const s = status.toLowerCase();
  if (s === 'running') return { cls: 'bg-accent-green/15 border-accent-green/30 text-accent-green', label: 'RUNNING' };
  if (s === 'waiting') return { cls: 'bg-accent-amber/15 border-accent-amber/30 text-accent-amber', label: 'WAITING' };
  if (s === 'queued') return { cls: 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber/80', label: 'QUEUED' };
  if (s === 'completed') return { cls: 'bg-surface-2 border-surface-3 text-white/70', label: 'DONE' };
  if (s === 'stopped') return { cls: 'bg-surface-2 border-surface-3 text-white/60', label: 'STOPPED' };
  if (s === 'failed' || s === 'error') return { cls: 'bg-red-500/10 border-red-500/20 text-red-300', label: 'FAILED' };
  return { cls: 'bg-surface-2 border-surface-3 text-white/60', label: status.toUpperCase() };
}

function StreamBadges({ run }: { run: RunInfo }) {
  const badges: Array<{ label: string; cls: string; title?: string }> = [];

  if (run.stream_url) {
    badges.push({
      label: 'STREAM',
      cls: 'bg-accent-blue/10 border-accent-blue/20 text-accent-blue',
      title: 'Stream environment is up',
    });
  }
  if (run.replay_worker_running) {
    badges.push({
      label: 'WORKER',
      cls: 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber',
      title: 'Stream worker is running',
    });
  }
  if (run.rtmp_active) {
    badges.push({
      label: 'LIVE',
      cls: 'bg-accent-green text-black border border-accent-green',
      title: 'RTMP push active',
    });
  }

  if (badges.length === 0) {
    return <span className="text-white/25 text-xs">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.label}
          title={b.title}
          className={`px-2 py-1 text-[11px] font-bold tracking-widest border ${b.cls}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

function nextActionForRun(run: RunInfo): {
  label: string;
  kind: 'start_stream' | 'start_worker' | 'go_live' | 'stop_live' | 'none';
  disabled?: boolean;
  disabledReason?: string;
} {
  // Stream pipeline is opt-in.
  if (!run.stream_url) {
    const canStart = (run.step_count || 0) > 0;
    return {
      label: 'START STREAM',
      kind: 'start_stream',
      disabled: !canStart,
      disabledReason: canStart ? undefined : 'Waiting for first step',
    };
  }
  if (!run.replay_worker_running) {
    return { label: 'START WORKER', kind: 'start_worker' };
  }
  if (!run.rtmp_active) {
    return { label: 'GO LIVE', kind: 'go_live' };
  }
  return { label: 'STOP LIVE', kind: 'stop_live' };
}

function RowMenu(props: {
  run: RunInfo;
  canControl: boolean;
  onAction: (kind: string) => void;
  busy?: boolean;
}) {
  const { run, canControl, onAction, busy } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const itemCls =
    'w-full text-left px-3 py-2 text-xs font-semibold tracking-wide text-white/70 hover:text-white hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right - 176 }); // 176 = w-44
    }
    setOpen((v) => !v);
  }

  return (
    <div ref={ref}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        className="h-8 w-8 border border-surface-3 bg-surface-2 text-white/70 hover:text-white hover:bg-surface-1 transition-colors"
        aria-label="Open row menu"
      >
        &#x22EF;
      </button>

      {open && (
        <div
          className="fixed w-44 bg-surface-1 border border-surface-3 shadow-xl z-50"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="py-1">
            <button
              className={itemCls}
              onClick={() => {
                setOpen(false);
                onAction('open');
              }}
            >
              Open
            </button>

            <div className="h-px bg-surface-3 my-1" />

            <button
              className={itemCls}
              disabled={!canControl || busy || run.status !== 'waiting'}
              onClick={() => {
                setOpen(false);
                onAction('start_run_worker');
              }}
            >
              Start run worker
            </button>

            <button
              className={itemCls}
              disabled={!canControl || busy || !run.stream_url}
              onClick={() => {
                setOpen(false);
                onAction('stop_stream');
              }}
            >
              Stop stream
            </button>

            <button
              className={itemCls}
              disabled={!canControl || busy || !run.replay_worker_running}
              onClick={() => {
                setOpen(false);
                onAction('stop_stream_worker');
              }}
            >
              Stop worker
            </button>

            <button
              className={itemCls}
              disabled={!canControl || busy || !run.rtmp_active}
              onClick={() => {
                setOpen(false);
                onAction('stop_live');
              }}
            >
              Stop live
            </button>

            <div className="h-px bg-surface-3 my-1" />

            <button
              className={`${itemCls} text-red-300 hover:text-red-200`}
              disabled={!canControl || busy || !['running', 'waiting', 'queued'].includes(run.status)}
              onClick={() => {
                setOpen(false);
                onAction('stop_run');
              }}
            >
              Stop run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPage(props: {
  initialRuns: RunInfo[];
  initialStatus: SystemStatus | null;
}) {
  const { initialRuns, initialStatus } = props;
  const { isAuthenticated } = useAuth();

  // When we "flip" to public control, UI should remain usable without login.
  const publicControl = process.env.NEXT_PUBLIC_DASHBOARD_PUBLIC_CONTROL === 'true';

  const canControl = isAuthenticated || publicControl;

  const [runs, setRuns] = useState<RunInfo[]>(initialRuns);
  const [status, setStatus] = useState<SystemStatus | null>(initialStatus);
  const [ops, setOps] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [busyRun, setBusyRun] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const [runsRes] = await Promise.all([
        fetchRuns({ limit: 200 }),
      ]);
      setRuns(runsRes);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    // Status updates slower than run polling; mostly for TOTAL_SLOTS.
    async function pollStatus() {
      try {
        const data = await fetchStatus();
        setStatus(data);
      } catch {
        // ignore
      }
    }
    pollStatus();
    const id = setInterval(pollStatus, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function pollOps() {
      if (!canControl) return;
      const data = await fetchOpsSummary();
      if (data) setOps(data);
    }
    pollOps();
    const id = setInterval(pollOps, 30_000);
    return () => clearInterval(id);
  }, [canControl]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.kind === 'ok' ? 1800 : 3200);
    return () => clearTimeout(id);
  }, [toast]);

  const derived = useMemo(() => {
    const running = runs.filter((r) => r.status === 'running').length;
    const waiting = runs.filter((r) => r.status === 'waiting' || r.status === 'queued').length;
    const streams = runs.filter((r) => !!r.stream_url).length;
    const live = runs.filter((r) => !!r.rtmp_active).length;
    const slotsUsed = new Set(
      runs
        .filter((r) => ['running', 'waiting', 'queued'].includes(r.status) && r.slot != null)
        .map((r) => r.slot as number),
    ).size;
    const totalSlots = status?.total_slots ?? 20;
    const tokenTotal = ops?.tokens_1h?.total_tokens ?? null;

    let gpu: { util: number; memUsedMib: number; memTotalMib: number } | null = null;
    const gpuPayload = ops?.stream_server?.gpu;
    if (gpuPayload?.available && Array.isArray(gpuPayload?.gpus) && gpuPayload.gpus.length > 0) {
      const g0 = gpuPayload.gpus[0];
      if (
        typeof g0?.utilization_gpu === 'number' &&
        typeof g0?.memory_used_mib === 'number' &&
        typeof g0?.memory_total_mib === 'number'
      ) {
        gpu = {
          util: g0.utilization_gpu,
          memUsedMib: g0.memory_used_mib,
          memTotalMib: g0.memory_total_mib,
        };
      }
    }

    return { running, waiting, streams, live, slotsUsed, totalSlots, tokenTotal, gpu };
  }, [runs, status, ops]);

  const runAction = useCallback(
    async (run: RunInfo, kind: string) => {
      if (!canControl && kind !== 'open') {
        setToast({ kind: 'err', msg: 'Login required' });
        return;
      }

      if (kind === 'open') {
        window.open(`/run/${run.run_id}`, '_blank');
        return;
      }

      setBusyRun((m) => ({ ...m, [run.run_id]: true }));
      try {
        if (kind === 'start_stream') {
          const res = await startReplay(run.run_id);
          if (!res) throw new Error('Failed to start stream');
          setToast({ kind: 'ok', msg: 'Stream started' });
        } else if (kind === 'stop_stream') {
          // Stop live first (best-effort), then stop stream.
          if (run.rtmp_active) await stopRtmp(run.run_id);
          await stopReplay(run.run_id);
          setToast({ kind: 'ok', msg: 'Stream stopped' });
        } else if (kind === 'start_stream_worker') {
          const res = await startReplayWorker(run.run_id);
          if (!res) throw new Error('Failed to start worker');
          setToast({ kind: 'ok', msg: 'Worker started' });
        } else if (kind === 'stop_stream_worker') {
          const res = await stopReplayWorker(run.run_id);
          if (!res) throw new Error('Failed to stop worker');
          setToast({ kind: 'ok', msg: 'Worker stopped' });
        } else if (kind === 'go_live') {
          const ok = await startRtmp(run.run_id);
          if (!ok) throw new Error('Failed to go live');
          setToast({ kind: 'ok', msg: 'Live' });
        } else if (kind === 'stop_live') {
          const ok = await stopRtmp(run.run_id);
          if (!ok) throw new Error('Failed to stop live');
          setToast({ kind: 'ok', msg: 'Live stopped' });
        } else if (kind === 'stop_run') {
          const res = await stopRun(run.run_id);
          if (!res) throw new Error('Failed to stop run');
          setToast({ kind: 'ok', msg: 'Run stopped' });
        } else if (kind === 'start_run_worker') {
          const res = await startWorker(run.run_id);
          if (!res) throw new Error('Failed to start run worker');
          setToast({ kind: 'ok', msg: 'Worker started' });
        }

        await refresh();
      } catch (e) {
        setToast({ kind: 'err', msg: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusyRun((m) => ({ ...m, [run.run_id]: false }));
      }
    },
    [canControl, refresh],
  );

  return (
    <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)]">
      <NavHeader>
        {!canControl && (
          <span className="ml-2 bg-surface-2 border border-surface-3 text-white/60 text-[11px] font-bold tracking-widest px-2 py-1">
            READ ONLY
          </span>
        )}
      </NavHeader>

      {/* Content */}
      <div className="px-10 py-8">
        {/* Top controls */}
        <div className="flex items-center justify-between mb-5">
          <div className="text-white/70 text-sm">
            <span className="font-[family-name:var(--font-heading)] font-semibold tracking-wide">Runs</span>
            <span className="text-white/30"> &bull; </span>
            <span className="text-white/40">{derived.running} running</span>
            {derived.waiting > 0 && (
              <>
                <span className="text-white/30"> &bull; </span>
                <span className="text-white/40">{derived.waiting} queued</span>
              </>
            )}
          </div>

          <button
            onClick={() => setDrawerOpen(true)}
            disabled={!canControl}
            className="h-10 px-4 bg-accent-green text-black font-[family-name:var(--font-heading)] font-bold tracking-wide text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            New run
          </button>
        </div>

        {/* Status strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-surface-1 border border-surface-3 px-4 py-3">
            <div className="text-white/40 text-[11px] font-bold tracking-widest">SLOTS</div>
            <div className="mt-1 text-white/90 font-[family-name:var(--font-heading)] font-bold text-xl tabular-nums">
              {derived.slotsUsed}/{derived.totalSlots}
            </div>
          </div>
          <div className="bg-surface-1 border border-surface-3 px-4 py-3">
            <div className="text-white/40 text-[11px] font-bold tracking-widest">STREAMS</div>
            <div className="mt-1 text-white/90 font-[family-name:var(--font-heading)] font-bold text-xl tabular-nums">
              {derived.streams}
            </div>
            {derived.gpu && (
              <div className="mt-1 text-white/35 text-xs tabular-nums">
                GPU {Math.round(derived.gpu.util)}% &bull; VRAM {(derived.gpu.memUsedMib / 1024).toFixed(1)}/
                {(derived.gpu.memTotalMib / 1024).toFixed(0)}GB
              </div>
            )}
          </div>
          <div className="bg-surface-1 border border-surface-3 px-4 py-3">
            <div className="text-white/40 text-[11px] font-bold tracking-widest">LIVE</div>
            <div className="mt-1 text-white/90 font-[family-name:var(--font-heading)] font-bold text-xl tabular-nums">
              {derived.live}
            </div>
          </div>
          <div className="bg-surface-1 border border-surface-3 px-4 py-3">
            <div className="text-white/40 text-[11px] font-bold tracking-widest">TOKENS (1H)</div>
            <div className="mt-1 text-white/90 font-[family-name:var(--font-heading)] font-bold text-xl tabular-nums">
              {formatCompactNumber(derived.tokenTotal)}
            </div>
          </div>
        </div>

        {/* Runs table */}
        <div className="bg-surface-1 border border-surface-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-2 border-b border-surface-3">
                <tr className="text-white/40 text-[11px] font-bold tracking-widest">
                  <th className="px-4 py-3">RUN</th>
                  <th className="px-4 py-3">STATUS</th>
                  <th className="px-4 py-3">STREAM</th>
                  <th className="px-4 py-3">MODEL</th>
                  <th className="px-4 py-3">STEPS</th>
                  <th className="px-4 py-3">AGE</th>
                  <th className="px-4 py-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const pill = statusPill(run.status);
                  const next = nextActionForRun(run);
                  const busy = !!busyRun[run.run_id];

                  return (
                    <tr
                      key={run.run_id}
                      className="border-b border-surface-3 last:border-b-0 hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/run/${run.run_id}`}
                            className="text-white/90 hover:text-white transition-colors text-sm font-semibold"
                          >
                            {run.run_id.slice(0, 8)}
                          </Link>
                          <span className="text-white/25 text-xs">#{run.slot ?? '—'}</span>
                        </div>
                        <div className="text-white/35 text-xs mt-0.5">
                          {run.task_key}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 text-[11px] font-bold tracking-widest border ${pill.cls}`}>
                          {pill.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StreamBadges run={run} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white/80 text-sm truncate max-w-[240px]" title={run.model}>
                          {run.model}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white/80 text-sm tabular-nums">
                          {run.step_count}/{run.max_steps}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white/60 text-sm tabular-nums">
                          {formatAge(run.created_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={!canControl || busy || next.kind === 'none' || next.disabled}
                            title={next.disabledReason}
                            onClick={() => {
                              if (next.kind === 'start_stream') return runAction(run, 'start_stream');
                              if (next.kind === 'start_worker') return runAction(run, 'start_stream_worker');
                              if (next.kind === 'go_live') return runAction(run, 'go_live');
                              if (next.kind === 'stop_live') return runAction(run, 'stop_live');
                            }}
                            className="h-8 px-3 bg-accent-green/15 border border-accent-green/30 text-accent-green text-xs font-bold tracking-widest hover:bg-accent-green/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            {busy ? '…' : next.label}
                          </button>

                          <RowMenu
                            run={run}
                            canControl={canControl}
                            busy={busy}
                            onAction={(kind) => runAction(run, kind)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {runs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-white/40 text-sm">
                      No runs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div
            className={`px-4 py-2 border text-sm font-semibold tracking-wide ${
              toast.kind === 'ok'
                ? 'bg-surface-1 border-surface-3 text-white/85'
                : 'bg-red-500/10 border-red-500/20 text-red-200'
            }`}
          >
            {toast.msg}
          </div>
        </div>
      )}

      <NewRunDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={() => {
          setToast({ kind: 'ok', msg: 'Run created' });
          refresh();
        }}
      />
    </main>
  );
}
