import { notFound } from 'next/navigation';
import { getStreamById } from '@/lib/streams';
import StreamPage from '@/components/Stream/StreamPage';

export default async function StreamRoute({
  params,
}: {
  params: Promise<{ streamId: string }>;
}) {
  const { streamId } = await params;
  const stream = getStreamById(streamId);
  if (!stream) notFound();

  return <StreamPage stream={stream} />;
}
