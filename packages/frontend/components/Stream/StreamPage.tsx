import type { StreamDefinition } from '@/lib/streams';
import StreamPlayer from './StreamPlayer';
import StreamInfoBar from './StreamInfoBar';
import ChatPlaceholder from '@/components/Chat/ChatPlaceholder';

export default function StreamPage({ stream }: { stream: StreamDefinition }) {
  return (
    <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)]">
      {/* Top bar — same as home */}
      <header className="h-12 bg-surface-1 border-b border-surface-3 flex items-center justify-between px-8">
        <a href="/" className="font-[family-name:var(--font-heading)] font-bold text-lg tracking-wide text-white hover:opacity-80 transition-opacity">
          CLAUDETORIO
        </a>
        <button className="text-accent-green font-semibold text-sm hover:opacity-80 transition-opacity">
          Login
        </button>
      </header>

      <div className="mx-auto max-w-[1400px] px-6 py-6">
        {/* Flex row: stream column + chat column, chat spans full height */}
        <div className="flex gap-4 items-stretch">
          {/* Left column: player + info bar */}
          <div className="flex-1 flex flex-col">
            <StreamPlayer stream={stream} />
            <StreamInfoBar stream={stream} />
          </div>

          {/* Right column: chat — stretches to match left column height */}
          <aside className="w-[340px] shrink-0">
            <ChatPlaceholder />
          </aside>
        </div>
      </div>
    </main>
  );
}
