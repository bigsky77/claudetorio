import { useEffect, useState, useCallback, useRef } from 'react';
import { RUN_POLL_INTERVAL_MS } from '@/constants';
import { fetchRunInfo, fetchRunSteps } from '@/services/api';
import type { RunInfo, RunStepInfo } from '@/interfaces';

function isActive(status: string): boolean {
  return status === 'running' || status === 'queued';
}

export function useRunPolling(initialRun: RunInfo, initialSteps: RunStepInfo[]) {
  const [run, setRun] = useState(initialRun);
  const [steps, setSteps] = useState(initialSteps);
  const active = isActive(run.status);
  const maxStepIdxRef = useRef(
    initialSteps.length > 0
      ? Math.max(...initialSteps.map((s) => s.step_idx))
      : -1,
  );

  const poll = useCallback(async () => {
    const [updatedRun, newSteps] = await Promise.all([
      fetchRunInfo(run.run_id),
      fetchRunSteps(run.run_id, { afterStepIdx: maxStepIdxRef.current }),
    ]);

    if (updatedRun) setRun(updatedRun);

    if (newSteps.length > 0) {
      setSteps((prev) => [...prev, ...newSteps]);
      maxStepIdxRef.current = Math.max(
        maxStepIdxRef.current,
        ...newSteps.map((s) => s.step_idx),
      );
    }
  }, [run.run_id]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(poll, RUN_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, poll]);

  return { run, steps, isActive: active, refetch: poll };
}
