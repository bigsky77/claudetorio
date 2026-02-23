// lib/streams.ts
export type StreamId = 'live' | 'replay-1' | 'replay-2';
export type StreamType = 'live' | 'replay';

export interface StreamDefinition {
  id: StreamId;
  type: StreamType;
  label: 'LIVE' | 'Replay';
  subtitle: string;
  thumbnailSrc: string;
  videoSrc?: string;
}

export const STREAMS: StreamDefinition[] = [
  {
    id: 'live',
    type: 'live',
    label: 'LIVE',
    subtitle: 'v0.0.1 - LIVESTREAM',
    thumbnailSrc: '/thumb-live.jpg',
    // TODO: replace with server-provided stream metadata
  },
  {
    id: 'replay-1',
    type: 'replay',
    label: 'Replay',
    subtitle: 'v0.0.1 - LIVESTREAM',
    thumbnailSrc: '/thumb-replay1.jpg',
    videoSrc: '/replays/replay1.mp4',
    // TODO: replace with real replay system (server-hosted replays)
  },
  {
    id: 'replay-2',
    type: 'replay',
    label: 'Replay',
    subtitle: 'v0.0.1 - LIVESTREAM',
    thumbnailSrc: '/thumb-replay2.jpg',
    videoSrc: '/replays/replay2.mp4',
    // TODO: replace with real replay system (server-hosted replays)
  },
];

export function getStreamById(id: string): StreamDefinition | undefined {
  return STREAMS.find((s) => s.id === id);
}

export function resolveStreamSource(
  stream: StreamDefinition,
): { kind: 'iframe' | 'video'; src: string } | null {
  if (stream.type === 'live') {
    // Pump stream wrapper (VTuber + Factorio composite)
    const wrapperUrl = process.env.NEXT_PUBLIC_LIVE_STREAM_URL || '';
    // Fallback to plain HLS stream URL if wrapper isn't configured
    const fallback = process.env.NEXT_PUBLIC_STREAM_URL || '';
    const liveUrl = wrapperUrl || fallback;
    // TODO: replace with real stream URL from broker/session selection
    return liveUrl ? { kind: 'iframe', src: liveUrl } : null;
  }

  if (stream.type === 'replay' && stream.videoSrc) {
    return { kind: 'video', src: stream.videoSrc };
  }

  return null;
}
