import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchLiveRun, fetchRunInfo } from '@/services/api';
import { streamFromRun } from '@/lib/streams';
import StreamPage from '@/components/Stream/StreamPage';
import LiveStreamPage from '@/components/Stream/LiveStreamPage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ streamId: string }>;
}): Promise<Metadata> {
  const { streamId } = await params;
  if (streamId === 'live') {
    return { title: 'LIVE Stream' };
  }
  return { title: 'Stream' };
}

export default async function StreamRoute({
  params,
}: {
  params: Promise<{ streamId: string }>;
}) {
  const { streamId } = await params;

  // For 'live', fetch the current live run server-side as initial data,
  // then hand off to a client component that can poll for changes.
  if (streamId === 'live') {
    const run = await fetchLiveRun();
    const stream = run ? streamFromRun(run) : null;
    return <LiveStreamPage initialStream={stream} />;
  }

  // For any other streamId, treat as a run ID and show its page
  const runInfo = await fetchRunInfo(streamId);
  if (!runInfo) notFound();

  const stream = streamFromRun(runInfo);
  return <StreamPage stream={stream} />;
}
