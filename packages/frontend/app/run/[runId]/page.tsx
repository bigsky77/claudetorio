import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchRunInfo, fetchRunSteps } from '@/services/api';
import type { RunStepInfo } from '@/interfaces';
import RunDetailClient from '@/components/RunDetail/RunDetailClient';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ runId: string }>;
}): Promise<Metadata> {
  const { runId } = await params;
  const run = await fetchRunInfo(runId, BROKER_URL);
  return {
    title: run ? `Run ${run.run_id}` : 'Run',
  };
}

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ stream_url?: string }>;
}) {
  const { runId } = await params;
  const { stream_url: streamUrlOverride } = await searchParams;

  const run = await fetchRunInfo(runId, BROKER_URL);
  if (!run) notFound();

  // Fetch all steps with pagination
  const allSteps: RunStepInfo[] = [];
  let afterIdx = -1;
  for (let hasMore = true; hasMore;) {
    const batch = await fetchRunSteps(runId, {
      limit: 500,
      afterStepIdx: afterIdx >= 0 ? afterIdx : undefined,
      baseUrl: BROKER_URL,
    });
    hasMore = batch.length > 0;
    if (!hasMore) break;
    allSteps.push(...batch);
    afterIdx = Math.max(...batch.map((s) => s.step_idx));
  }

  const effectiveRun = streamUrlOverride ? { ...run, stream_url: streamUrlOverride } : run;
  return (
    <RunDetailClient
      initialRun={effectiveRun}
      initialSteps={allSteps}
      streamUrl={effectiveRun.stream_url as string}
    />
  );
}
