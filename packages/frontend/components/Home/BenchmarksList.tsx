'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchRuns } from '@/services/api';
import type { RunInfo } from '@/interfaces';

export default function BenchmarksList() {
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchRuns({ limit: 200 }).then((data) => {
      if (!cancelled) {
        setRuns(data);
        setLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (!loaded) {
    return (
      <div className="text-white/50 font-[family-name:var(--font-body)] text-sm">
        Loading...
      </div>
    );
  }

  if (!runs.length) {
    return (
      <div className="text-white/50 font-[family-name:var(--font-body)] text-sm">
        No benchmarks found. (Start one from <Link className="text-accent-green underline" href="/dashboard">/dashboard</Link>)
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
