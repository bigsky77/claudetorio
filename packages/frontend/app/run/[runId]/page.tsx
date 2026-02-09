import { notFound } from 'next/navigation';
import { fetchRunInfo, fetchRunSteps } from '@/services/api';
import type { RunStepInfo } from '@/interfaces';
import RunDetailClient from '@/components/RunDetail/RunDetailClient';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';

export default async function RunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  const run = await fetchRunInfo(runId, BROKER_URL);
  if (!run) notFound();

  // Fetch all steps with pagination
  const allSteps: RunStepInfo[] = [];
  let afterIdx = -1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await fetchRunSteps(runId, {
      limit: 500,
      afterStepIdx: afterIdx >= 0 ? afterIdx : undefined,
      baseUrl: BROKER_URL,
    });
    if (batch.length === 0) break;
    allSteps.push(...batch);
    afterIdx = Math.max(...batch.map((s) => s.step_idx));
  }

  return (
    <RunDetailClient
      initialRun={run}
      initialSteps={allSteps}
      streamUrl={run.stream_url as string}
    />
  );
}
