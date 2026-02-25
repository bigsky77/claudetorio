import Link from 'next/link';
import BenchmarksList from './BenchmarksList';
import type { TwitchStream, TwitchVideo } from '@/lib/twitch';

function formatViewerCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(duration: string): string {
  // Twitch duration format: "1h2m3s", "45m30s", "12s"
  return duration.replace('h', 'h ').replace('m', 'm ').trim();
}

function getThumbnailUrl(url: string, width = 320, height = 180): string {
  return url.replace('{width}', String(width)).replace('{height}', String(height));
}

export default function HomePage({
  liveStream,
  videos,
}: {
  liveStream: TwitchStream | null;
  videos: TwitchVideo[];
}) {
  const channel = process.env.NEXT_PUBLIC_TWITCH_CHANNEL ?? '';

  return (
    <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)]">
      {/* Top bar */}
      <header className="h-12 bg-surface-1 border-b border-surface-3 flex items-center justify-between px-8">
        <span className="font-[family-name:var(--font-heading)] font-bold text-lg tracking-wide text-white">
          CLAUDETORIO
        </span>
        <button className="text-accent-green font-semibold text-sm hover:opacity-80 transition-opacity">
          Login
        </button>
      </header>

      <div className="px-10 py-8 space-y-12">
        {/* STREAMS */}
        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-6 tracking-wide">
            STREAMS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Live channel card */}
            {channel && (
              <Link
                href="/stream/twitch-live"
                className="block bg-surface-1 border border-surface-3 hover:border-surface-3/80 transition-colors"
              >
                <div className="p-4 flex items-center gap-2">
                  {liveStream ? (
                    <>
                      <span className="bg-accent-green text-black text-xs font-bold px-2 py-1 uppercase">LIVE</span>
                      <span className="text-white/60 text-xs">{formatViewerCount(liveStream.viewer_count)} viewers</span>
                    </>
                  ) : (
                    <span className="bg-surface-3 text-white/60 text-xs font-bold px-2 py-1 uppercase">OFFLINE</span>
                  )}
                </div>
                <div className="px-4">
                  <div className="bg-surface-2 p-1">
                    {liveStream ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getThumbnailUrl(liveStream.thumbnail_url)}
                        alt=""
                        className="w-full aspect-video object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-video bg-surface-3 flex items-center justify-center">
                        <span className="text-white/30 text-sm">No stream</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-white/90 text-sm font-[family-name:var(--font-body)] font-medium">
                    {liveStream ? liveStream.title : `${channel} — offline`}
                  </div>
                </div>
              </Link>
            )}

            {/* VOD cards */}
            {videos.slice(0, channel ? 2 : 3).map((video) => (
              <Link
                key={video.id}
                href={`/stream/twitch-vod-${video.id}`}
                className="block bg-surface-1 border border-surface-3 hover:border-surface-3/80 transition-colors"
              >
                <div className="p-4 flex items-center gap-2">
                  <span className="bg-accent-blue text-black text-xs font-bold px-2 py-1 uppercase">VOD</span>
                  <span className="text-white/60 text-xs">{formatDuration(video.duration)}</span>
                </div>
                <div className="px-4">
                  <div className="bg-surface-2 p-1">
                    {video.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getThumbnailUrl(video.thumbnail_url)}
                        alt=""
                        className="w-full aspect-video object-cover"
                      />
                    ) : (
                      <div className="w-full aspect-video bg-surface-3" />
                    )}
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-white/90 text-sm font-[family-name:var(--font-body)] font-medium line-clamp-2">
                    {video.title}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* TOURNAMENT */}
        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-6 tracking-wide">
            TOURNAMENT
          </h2>
          <div className="bg-surface-1 border border-surface-3 h-40 flex items-center justify-center">
            <div className="text-accent-amber font-[family-name:var(--font-heading)] font-bold text-2xl tracking-widest">
              COUNTDOWN
            </div>
          </div>
        </section>

        {/* BENCHMARKS */}
        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-6 tracking-wide">
            BENCHMARKS
          </h2>
          <BenchmarksList />
        </section>
      </div>
    </main>
  );
}
