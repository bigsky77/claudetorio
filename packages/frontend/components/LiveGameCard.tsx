import type { LiveSessionWithScore } from '@/interfaces';
import { formatElapsedTime } from '@/utils/format';

export default function LiveGameCard({
  session,
  onClick,
}: {
  session: LiveSessionWithScore;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="bg-gray-800 rounded-lg p-4 border border-green-500/30 hover:border-green-500/50 transition-colors cursor-pointer"
    >
      <div className="flex justify-between items-start">
        <div className="font-bold text-lg">{session.username}</div>
        <div className="text-green-400 font-mono text-sm">
          {formatElapsedTime(session.started_at)}
        </div>
      </div>
      <div className="text-2xl font-mono text-green-400 mt-2">
        {session.current_score.toLocaleString()}
      </div>
      <div className="text-gray-400 text-sm mt-1">
        Slot {session.slot}
      </div>
      <div className="mt-2 h-1 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-500 to-green-400 animate-pulse"
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
