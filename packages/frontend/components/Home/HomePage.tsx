import StreamCard from './StreamCard';
import BenchmarksList from './BenchmarksList';
import { STREAMS } from '@/lib/streams';

export default function HomePage() {
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
            {STREAMS.map((s) => (
              <StreamCard key={s.id} stream={s} />
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

      {/* Footer */}
      <footer className="h-14 bg-surface-1 border-t border-surface-3 flex items-center justify-center gap-14 px-8">
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
