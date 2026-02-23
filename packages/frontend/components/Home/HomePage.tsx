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
    </main>
  );
}
