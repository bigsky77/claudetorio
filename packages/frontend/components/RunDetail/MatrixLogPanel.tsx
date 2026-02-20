'use client';

import { useMemo, useState } from 'react';
import type { RunStepInfo } from '@/interfaces';

type LogView = 'code' | 'result';

export default function MatrixLogPanel({
  steps,
  isActive,
}: {
  steps: RunStepInfo[];
  isActive: boolean;
}) {
  const latestStep = steps.length > 0 ? steps[steps.length - 1] : null;
  const latestStepIdx = latestStep?.step_idx ?? null;

  const [manualSelectedStepIdx, setManualSelectedStepIdx] = useState<number | null>(latestStepIdx);
  const [activeTab, setActiveTab] = useState<LogView>('code');
  const [followLatest, setFollowLatest] = useState(true);

  const selectedStepIdx = followLatest ? latestStepIdx : manualSelectedStepIdx;

  const selectedStep = useMemo(() => {
    if (selectedStepIdx == null) return null;
    const match = steps.find((step) => step.step_idx === selectedStepIdx);
    return match ?? latestStep;
  }, [selectedStepIdx, steps, latestStep]);

  const selectorSteps = useMemo(() => [...steps].reverse(), [steps]);
  const panelText =
    activeTab === 'code'
      ? selectedStep?.code ?? 'No code available yet.'
      : selectedStep?.result ?? 'No result yet.';

  const panelTone = activeTab === 'result' && selectedStep?.error_occurred
    ? 'text-red-300'
    : 'text-emerald-300';

  function handleStepChange(stepIdx: number) {
    setManualSelectedStepIdx(stepIdx);
    setFollowLatest(false);
  }

  function handleFollowLatest(enabled: boolean) {
    setFollowLatest(enabled);
    if (enabled) {
      setManualSelectedStepIdx(latestStepIdx);
    }
  }

  return (
    <section className="matrix-panel flex h-[50vh] flex-col overflow-hidden rounded-2xl border border-emerald-500/25 bg-black/80 p-3 shadow-[0_0_40px_rgba(0,0,0,0.55)] backdrop-blur-md lg:h-full">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-emerald-400">
          Runtime Logs
        </h2>
        <span className="text-[11px] text-emerald-500/80">
          {steps.length} steps
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="text-[11px] uppercase tracking-wide text-emerald-400/85" htmlFor="step-select">
          Step
        </label>
        <select
          id="step-select"
          value={selectedStep?.step_idx ?? ''}
          disabled={steps.length === 0}
          onChange={(e) => handleStepChange(Number(e.target.value))}
          className="min-w-[120px] rounded border border-emerald-500/40 bg-black/70 px-2 py-1 text-xs text-emerald-200 outline-none focus:border-emerald-400"
        >
          {steps.length === 0 && (
            <option value="">No logs</option>
          )}
          {selectorSteps.map((step) => (
            <option key={step.id} value={step.step_idx}>
              Step #{step.step_idx}
            </option>
          ))}
        </select>

        <label className="ml-auto flex items-center gap-1 text-[11px] text-emerald-300/80">
          <input
            type="checkbox"
            checked={followLatest}
            disabled={!isActive || steps.length === 0}
            onChange={(e) => handleFollowLatest(e.target.checked)}
            className="accent-emerald-500"
          />
          Follow latest
        </label>
      </div>

      <div className="mb-3 flex gap-2">
        <TabButton
          active={activeTab === 'code'}
          onClick={() => setActiveTab('code')}
        >
          Code
        </TabButton>
        <TabButton
          active={activeTab === 'result'}
          onClick={() => setActiveTab('result')}
        >
          Result
        </TabButton>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded border border-emerald-500/25 bg-black/60">
        <pre className={`matrix-text h-full overflow-auto p-3 text-xs leading-6 whitespace-pre-wrap ${panelTone}`}>
          {panelText}
        </pre>
      </div>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1.5 text-xs font-mono uppercase tracking-wide transition-colors ${
        active
          ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/50'
          : 'bg-black/50 text-emerald-400/70 border border-emerald-500/20 hover:text-emerald-200'
      }`}
    >
      {children}
    </button>
  );
}
