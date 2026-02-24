'use client';

import { useEffect, useState } from 'react';
import type { StreamDefinition } from '@/lib/streams';
import { streamFromRun } from '@/lib/streams';
import { fetchLiveRun } from '@/services/api';
import StreamPlayer from './StreamPlayer';
import StreamInfoBar from './StreamInfoBar';
import ChatPanel from '@/components/Chat/ChatPanel';

export default function LiveStreamPage({
  initialStream,
}: {
  initialStream: StreamDefinition | null;
}) {
  const [stream, setStream] = useState<StreamDefinition | null>(initialStream);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const run = await fetchLiveRun();
      if (cancelled) return;
      setStream(run ? streamFromRun(run) : null);
    }

    const interval = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!stream) {
    return (
      <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)]">
        <header className="h-12 bg-surface-1 border-b border-surface-3 flex items-center justify-between px-8">
          <a href="/" className="font-[family-name:var(--font-heading)] font-bold text-lg tracking-wide text-white hover:opacity-80 transition-opacity">
            CLAUDETORIO
          </a>
        </header>
        <div className="flex items-center justify-center h-[calc(100vh-3rem)]">
          <div className="text-white/40 text-lg font-[family-name:var(--font-body)]">
            No live stream right now. Waiting...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)]">
      <header className="h-12 bg-surface-1 border-b border-surface-3 flex items-center justify-between px-8">
        <a href="/" className="font-[family-name:var(--font-heading)] font-bold text-lg tracking-wide text-white hover:opacity-80 transition-opacity">
          CLAUDETORIO
        </a>
        <button className="text-accent-green font-semibold text-sm hover:opacity-80 transition-opacity">
          Login
        </button>
      </header>

      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex gap-4 items-stretch">
          <div className="flex-1 flex flex-col">
            <StreamPlayer stream={stream} />
            <StreamInfoBar stream={stream} />
          </div>
          <aside className="w-[340px] shrink-0 max-h-[calc(100vh-6rem)] sticky top-6">
            <ChatPanel streamId={stream.id} />
          </aside>
        </div>
      </div>
    </main>
  );
}
