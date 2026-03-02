import Link from 'next/link';
import BenchmarksList from './BenchmarksList';
import TournamentCountdown from './TournamentCountdown';
import LoginWidget from '@/components/Auth/LoginWidget';
import type { TwitchStream, TwitchVideo } from '@/lib/twitch';
import type { RunInfo } from '@/interfaces';

function formatViewerCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(duration: string): string {
  // Twitch duration format: "1h2m3s", "45m30s", "12s"
  return duration.replace('h', 'h ').replace('m', 'm ').trim();
}

function getThumbnailUrl(url: string, width = 320, height = 180): string {
  return url
    .replace('%{width}', String(width))
    .replace('%{height}', String(height))
    .replace('{width}', String(width))
    .replace('{height}', String(height));
}

export default function HomePage({
  liveStream,
  videos,
  liveRun,
  recentRuns = [],
}: {
  liveStream: TwitchStream | null;
  videos: TwitchVideo[];
  liveRun: RunInfo | null;
  recentRuns?: RunInfo[];
}) {
  // Match VODs to completed runs by order (both reverse-chronological).
  // Skip the live/running run since it maps to the live card, not a VOD.
  const completedRuns = recentRuns.filter((r) => r.status !== 'running');
  const channel = process.env.NEXT_PUBLIC_TWITCH_CHANNEL ?? '';

  return (
    <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)]">
      {/* Top bar */}
      <header className="h-14 bg-surface-1 border-b border-surface-3 flex items-center justify-between px-8">
        <span className="font-[family-name:var(--font-heading)] font-bold text-lg tracking-wide text-white">
          CLAUDETORIO
        </span>
        <LoginWidget />
      </header>

      <div className="px-10 py-8 pb-20 space-y-12">
        {/* STREAMS */}
        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-6 tracking-wide">
            STREAMS
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Claudetorio live run card */}
            {liveRun && (
              <Link
                href={`/run/${liveRun.run_id}`}
                className="block bg-surface-1 border border-accent-green/40 hover:border-accent-green/70 transition-colors"
              >
                <div className="p-4 flex items-center gap-2">
                  <span className="flex items-center gap-1.5 bg-accent-green text-black text-xs font-bold px-2 py-1 uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                    LIVE
                  </span>
                  <span className="text-white/60 text-xs truncate">{liveRun.model}</span>
                </div>
                <div className="px-4">
                  <div className="bg-surface-2 p-1">
                    <div className="w-full aspect-video bg-surface-3 flex items-center justify-center">
                      <span className="text-white/30 text-sm font-[family-name:var(--font-heading)] tracking-wide">
                        AI PLAYING FACTORIO
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  <div className="text-white/90 text-sm font-[family-name:var(--font-body)] font-medium">
                    Claudetorio &middot; {liveRun.model} &middot; Step {liveRun.step_count}
                  </div>
                </div>
              </Link>
            )}

            {/* Live Twitch channel card */}
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
                    {liveStream
                      ? `${liveStream.title || 'Claudetorio'} \u00b7 ${liveRun?.model ?? 'claude-sonnet-4-5'} \u00b7 ${formatViewerCount(liveStream.viewer_count)} viewers`
                      : `Claudetorio \u00b7 ${liveRun?.model ?? 'claude-sonnet-4-5'} \u00b7 offline`}
                  </div>
                </div>
              </Link>
            )}

            {/* VOD cards */}
            {videos.slice(0, liveRun ? (channel ? 1 : 2) : (channel ? 2 : 3)).map((video, idx) => {
              const matchedRun = completedRuns[idx];
              const model = matchedRun?.model ?? 'claude-sonnet-4-5';
              return (
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
                    {video.title || 'Claudetorio'} &middot; {model} &middot; {formatViewerCount(video.view_count)} views
                  </div>
                </div>
              </Link>
              );
            })}
          </div>
        </section>

        {/* TOURNAMENT */}
        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-6 tracking-wide">
            TOURNAMENT
          </h2>
          <TournamentCountdown />
        </section>

        {/* BENCHMARKS */}
        <section>
          <h2 className="font-[family-name:var(--font-heading)] text-2xl font-bold mb-6 tracking-wide">
            BENCHMARKS
          </h2>
          <BenchmarksList />
        </section>
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 h-12 bg-surface-1 border-t border-surface-3 flex items-center justify-center gap-14 px-8 z-50">
        <a href="https://www.twitch.tv/claudetorio" target="_blank" rel="noopener noreferrer" className="text-[#9146FF] hover:opacity-70 transition-opacity" aria-label="Twitch">
          <svg height="22" viewBox="20 10 1100 270" fill="currentColor"><path d="M170 170h-70v20h70v80H60l-40-40V20h80v70h70zM470 270H230l-40-40V90h80v100h20V90h80v100h20V90h80zM490 90h80v180h-80zM490 20h80v50h-80zM740 170h-70v20h70v80H630l-40-40V20h80v70h70zM920 170h-80v20h80v80H800l-40-40V130l40-40h120zM1120 270h-80V170h-20v100h-80V20h80v70h60l40 40z"/></svg>
        </a>
        <a href="https://kick.com/claudetorio" target="_blank" rel="noopener noreferrer" className="text-[#53FC18] hover:opacity-70 transition-opacity" aria-label="Kick">
          <svg height="18" viewBox="0 0 300 80" fill="currentColor"><rect x="0" y="0" width="20" height="80"/><rect x="20" y="30" width="20" height="20"/><rect x="40" y="20" width="20" height="20"/><rect x="40" y="40" width="20" height="20"/><rect x="60" y="0" width="20" height="20"/><rect x="60" y="60" width="20" height="20"/><rect x="100" y="0" width="20" height="80"/><rect x="140" y="0" width="60" height="20"/><rect x="140" y="20" width="20" height="40"/><rect x="140" y="60" width="60" height="20"/><rect x="220" y="0" width="20" height="80"/><rect x="240" y="30" width="20" height="20"/><rect x="260" y="20" width="20" height="20"/><rect x="260" y="40" width="20" height="20"/><rect x="280" y="0" width="20" height="20"/><rect x="280" y="60" width="20" height="20"/></svg>
        </a>
      </footer>
    </main>
  );
}
