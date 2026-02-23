import type { StreamDefinition } from '@/lib/streams';
import StreamPlayer from './StreamPlayer';
import ChatPlaceholder from '@/components/Chat/ChatPlaceholder';

export default function StreamPage({ stream }: { stream: StreamDefinition }) {
  return (
    <main className="min-h-screen space-bg text-white">
      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="flex gap-8 items-start">
          {/* Left: stream */}
          <div className="flex-1">
            <StreamPlayer stream={stream} />
          </div>

          {/* Right: chat */}
          <aside className="w-[360px] shrink-0">
            <ChatPlaceholder />
          </aside>
        </div>
      </div>
    </main>
  );
}
