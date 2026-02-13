import type { LiveSessionWithScore, StreamSession } from '@/interfaces';
import LiveGameCard from './LiveGameCard';

export default function LiveGamesGrid({
  liveSessions,
  lastUpdate,
  onSelectStream,
}: {
  liveSessions: LiveSessionWithScore[];
  lastUpdate: Date;
  onSelectStream: (stream: StreamSession) => void;
}) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold mb-4 flex items-center">
        <span className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></span>
        Live Games
        <span className="ml-auto text-sm font-normal text-gray-500">
          Updated {lastUpdate.toLocaleTimeString()}
        </span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {liveSessions.map((session) => (
          <LiveGameCard
            key={session.session_id}
            session={session}
            onClick={() => onSelectStream({
              sessionId: session.session_id,
              username: session.username,
              streamUrl: session.stream_url,
            })}
          />
        ))}
      </div>
    </div>
  );
}
