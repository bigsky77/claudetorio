import HomePage from '@/components/Home/HomePage';
import { getLiveStream, getVideos } from '@/lib/twitch';
import type { TwitchStream, TwitchVideo } from '@/lib/twitch';

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

  return <HomePage liveStream={liveStream} videos={videos} />;
}
