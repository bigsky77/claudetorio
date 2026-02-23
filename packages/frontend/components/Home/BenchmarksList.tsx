import Link from 'next/link';
import { fetchRuns } from '@/services/api';

const BROKER_URL = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';

export default async function BenchmarksList() {
  const runs = await fetchRuns({ limit: 200, baseUrl: BROKER_URL });

  if (!runs.length) {
    return (
      <div className="text-white/50 font-[family-name:var(--font-body)] text-sm">
        No benchmarks found. (Start one from <Link className="text-accent-green underline" href="/arena">/arena</Link>)
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <Link
          key={run.run_id}
          href={`/run/${run.run_id}`}
          className="block bg-surface-1 border border-surface-3 hover:border-accent-green/40 transition-colors h-10"
          title={`Open run ${run.run_id}`}
        >
          <div className="h-full px-4 flex items-center justify-between">
            <div className="text-white/90 font-[family-name:var(--font-body)] font-bold text-sm truncate">
              {run.run_id}
            </div>
            <div className="text-white/50 font-[family-name:var(--font-body)] text-xs font-semibold">
              {run.status} &bull; {run.step_count} steps
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
