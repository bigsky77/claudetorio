// lib/streams.ts
import type { RunInfo } from '@/interfaces';

export type StreamId = 'live' | 'replay-1' | 'replay-2' | 'twitch-live' | string;
export type StreamType = 'live' | 'replay' | 'twitch-live' | 'twitch-vod';

export interface StreamDefinition {
  id: StreamId;
  type: StreamType;
  label: 'LIVE' | 'Replay' | 'VOD';
  subtitle: string;
  thumbnailSrc: string;
  videoSrc?: string;
  /** HLS stream URL (e.g. https://cr0.stream.claudetorio.ai/) */
  streamUrl?: string;
  runId?: string;
  // For Twitch VODs
  twitchVideoId?: string;
}

/** Build a StreamDefinition from a live RunInfo. */
export function streamFromRun(run: RunInfo): StreamDefinition {
  return {
    id: 'live',
    type: 'live',
    label: 'LIVE',
    subtitle: `${run.model} — ${run.task_key} — step ${run.step_count}`,
    thumbnailSrc: '/thumb-live.jpg',
    runId: run.run_id,
    streamUrl: run.stream_url ?? undefined,
  };
}

export const STREAMS: StreamDefinition[] = [
  {
    id: 'live',
    type: 'live',
    label: 'LIVE',
    subtitle: 'v0.0.1 - LIVESTREAM',
    thumbnailSrc: '/thumb-live.jpg',
  },
  {
    id: 'replay-1',
    type: 'replay',
    label: 'Replay',
    subtitle: 'v0.0.1 - LIVESTREAM',
    thumbnailSrc: '/thumb-replay1.jpg',
    videoSrc: '/replays/replay1.mp4',
  },
  {
    id: 'replay-2',
    type: 'replay',
    label: 'Replay',
    subtitle: 'v0.0.1 - LIVESTREAM',
    thumbnailSrc: '/thumb-replay2.jpg',
    videoSrc: '/replays/replay2.mp4',
  },
];

export function getStreamById(id: string): StreamDefinition | undefined {
  // Handle Twitch live stream
  if (id === 'twitch-live') {
    return {
      id: 'twitch-live',
      type: 'twitch-live',
      label: 'LIVE',
      subtitle: 'Twitch Live Stream',
      thumbnailSrc: '',
    };
  }

  // Handle Twitch VODs: twitch-vod-{videoId}
  if (id.startsWith('twitch-vod-')) {
    const videoId = id.slice('twitch-vod-'.length);
    return {
      id,
      type: 'twitch-vod',
      label: 'VOD',
      subtitle: `Twitch VOD`,
      thumbnailSrc: '',
      twitchVideoId: videoId,
    };
  }

  return STREAMS.find((s) => s.id === id);
}

export function resolveStreamSource(
  stream: StreamDefinition,
): { kind: 'hls' | 'iframe' | 'video'; src: string } | null {
  // Prefer HLS stream when available (lightweight, no nested page load)
  if (stream.streamUrl) {
    return { kind: 'hls', src: stream.streamUrl };
  }

  if (stream.type === 'twitch-live') {
    const channel = process.env.NEXT_PUBLIC_TWITCH_CHANNEL;
    const parent = process.env.NEXT_PUBLIC_TWITCH_EMBED_PARENT || 'localhost';
    if (!channel) return null;
    return { kind: 'iframe', src: `https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=true` };
  }

  if (stream.type === 'twitch-vod' && stream.twitchVideoId) {
    const parent = process.env.NEXT_PUBLIC_TWITCH_EMBED_PARENT || 'localhost';
    return { kind: 'iframe', src: `https://player.twitch.tv/?video=${stream.twitchVideoId}&parent=${parent}&autoplay=false` };
  }

  if (stream.type === 'live') {
    // Fallback to env-configured stream URLs
    const wrapperUrl = process.env.NEXT_PUBLIC_LIVE_STREAM_URL || '';
    const fallback = process.env.NEXT_PUBLIC_STREAM_URL || '';
    const liveUrl = wrapperUrl || fallback;
    return liveUrl ? { kind: 'iframe', src: liveUrl } : null;
  }

  if (stream.type === 'replay' && stream.videoSrc) {
    return { kind: 'video', src: stream.videoSrc };
  }

  return null;
}
