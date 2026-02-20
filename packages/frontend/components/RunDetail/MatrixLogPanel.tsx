'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunStepInfo } from '@/interfaces';

type LogView = 'code' | 'result';
type DisplaySource = 'auto' | 'manual_step_select' | 'tab_change';

export type RuntimeDisplayPayload = {
  text: string;
  tone: 'normal' | 'error';
  fadeMode: 'normal' | 'slow';
  stepIdx: number | null;
  source: DisplaySource;
};

export default function MatrixLogPanel({
  steps,
  onDisplayChange,
}: {
  steps: RunStepInfo[];
  onDisplayChange: (payload: RuntimeDisplayPayload) => void;
}) {
  const latestStep = steps.length > 0 ? steps[steps.length - 1] : null;
  const latestStepIdx = latestStep?.step_idx ?? null;

  const [manualSelectedStepIdx, setManualSelectedStepIdx] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<LogView>('code');
  const [followLatest, setFollowLatest] = useState(true);
  const nextSourceRef = useRef<DisplaySource>('auto');
  const prevLatestStepIdxRef = useRef<number | null>(null);
  const selectedStepIdx = followLatest ? latestStepIdx : manualSelectedStepIdx;

  const selectedStep = useMemo(() => {
    if (selectedStepIdx == null) return null;
    const match = steps.find((step) => step.step_idx === selectedStepIdx);
    return match ?? latestStep;
  }, [selectedStepIdx, steps, latestStep]);

  const selectorSteps = useMemo(() => [...steps].reverse(), [steps]);

  function handleStepChange(stepIdx: number) {
    nextSourceRef.current = 'manual_step_select';
    setManualSelectedStepIdx(stepIdx);
    setFollowLatest(stepIdx === latestStepIdx);
  }

  function handleTabChange(tab: LogView) {
    nextSourceRef.current = 'tab_change';
    setActiveTab(tab);
  }

  useEffect(() => {
    const source = nextSourceRef.current;
    const text = activeTab === 'code'
      ? selectedStep?.code ?? 'No code available yet.'
      : selectedStep?.result ?? 'No result yet.';
    const tone = activeTab === 'result' && selectedStep?.error_occurred ? 'error' : 'normal';

    onDisplayChange({
      text,
      tone,
      fadeMode: source === 'manual_step_select' ? 'slow' : 'normal',
      stepIdx: selectedStep?.step_idx ?? null,
      source,
    });
    nextSourceRef.current = 'auto';
  }, [activeTab, selectedStep, onDisplayChange]);

  useEffect(() => {
    if (latestStep == null) return;
    if (prevLatestStepIdxRef.current === latestStep.step_idx) return;

    prevLatestStepIdxRef.current = latestStep.step_idx;

    const text = activeTab === 'code'
      ? latestStep.code ?? 'No code available yet.'
      : latestStep.result ?? 'No result yet.';
    const tone = activeTab === 'result' && latestStep.error_occurred ? 'error' : 'normal';

    onDisplayChange({
      text,
      tone,
      fadeMode: 'normal',
      stepIdx: latestStep.step_idx,
      source: 'auto',
    });
  }, [latestStep, activeTab, onDisplayChange]);

  return (
    <section className="matrix-panel flex flex-col rounded-xl border border-emerald-500/30 bg-black/70 p-2.5 backdrop-blur-sm shadow-[0_0_20px_rgba(0,0,0,0.4)]">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
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
      </div>

      <div className="flex gap-2">
        <TabButton
          active={activeTab === 'code'}
          onClick={() => handleTabChange('code')}
        >
          Code
        </TabButton>
        <TabButton
          active={activeTab === 'result'}
          onClick={() => handleTabChange('result')}
        >
          Result
        </TabButton>
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
