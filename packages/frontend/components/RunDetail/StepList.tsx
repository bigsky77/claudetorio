import { useState, useEffect, useRef, useCallback } from 'react';
import type { RunStepInfo } from '@/interfaces';
import StepItem from './StepItem';

export default function StepList({
  steps,
  isActive,
}: {
  steps: RunStepInfo[];
  isActive: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    if (steps.length === 0) return new Set();
    return new Set([steps[steps.length - 1].step_idx]);
  });
  const [showJump, setShowJump] = useState(false);
  const prevLenRef = useRef(steps.length);
  const bottomRef = useRef<HTMLDivElement>(null);

  // When new steps arrive on an active run, auto-expand latest + show jump button
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (steps.length > prevLenRef.current && isActive) {
      const latest = steps[steps.length - 1].step_idx;
      timeoutId = setTimeout(() => {
        setExpanded((prev) => new Set(prev).add(latest));
        setShowJump(true);
      }, 0);
    }
    prevLenRef.current = steps.length;
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [steps.length, isActive, steps]);

  const toggle = useCallback((idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowJump(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Steps ({steps.length})</h2>
        {showJump && isActive && (
          <button
            onClick={jumpToLatest}
            className="text-sm px-3 py-1 rounded bg-orange-600 hover:bg-orange-500 transition-colors"
          >
            Jump to Latest
          </button>
        )}
      </div>
      <div className="space-y-1">
        {steps.map((step) => (
          <StepItem
            key={step.id}
            step={step}
            expanded={expanded.has(step.step_idx)}
            onToggle={() => toggle(step.step_idx)}
          />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
