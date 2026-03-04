import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: 'Claudetorio - Streams' } };

import HomePage from '@/components/Home/HomePage';
import { getLiveStream, getVideos } from '@/lib/twitch';
import { fetchRuns } from '@/services/api';
import type { TwitchStream, TwitchVideo } from '@/lib/twitch';
import type { RunInfo } from '@/interfaces';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';

export default async function Home() {
  const channel = process.env.TWITCH_CHANNEL ?? '';
  let liveStream: TwitchStream | null = null;
  let videos: TwitchVideo[] = [];

  if (channel) {
    [liveStream, videos] = await Promise.all([
      getLiveStream(channel),
      getVideos(channel),
    ]);
  }

  const [liveRuns, recentRuns] = await Promise.all([
    fetchRuns({ status: 'running', limit: 1, baseUrl: BROKER_URL }),
    fetchRuns({ limit: 10, baseUrl: BROKER_URL }),
  ]);
  const liveRun: RunInfo | null = liveRuns[0] ?? null;

  return <HomePage liveStream={liveStream} videos={videos} liveRun={liveRun} recentRuns={recentRuns} />;
}
