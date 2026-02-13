import type { UnifiedLeaderboardEntry } from '@/interfaces';
import { formatElapsedTime } from '@/utils/format';

export default function LeaderboardRow({
  entry,
  rank,
  onClick,
}: {
  entry: UnifiedLeaderboardEntry;
  rank: number;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={`border-t border-gray-700 hover:bg-gray-700/50 ${
        entry.isLive ? 'bg-green-900/20' : ''
      } ${entry.session_id ? 'cursor-pointer' : ''}`}
    >
      <td className="px-4 py-3">
        {rank <= 3 ? (
          <span className="text-2xl">
            {rank === 1 && '1st'}
            {rank === 2 && '2nd'}
            {rank === 3 && '3rd'}
          </span>
        ) : (
          <span className="text-gray-400">#{rank}</span>
        )}
      </td>
      <td className="px-4 py-3 font-medium">
        <div className="flex items-center">
          {entry.isLive && (
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
          )}
          {entry.username}
        </div>
      </td>
      <td className={`px-4 py-3 text-right font-mono ${
        entry.isLive ? 'text-green-400' : 'text-orange-400'
      }`}>
        {entry.score.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-right">
        {entry.isLive ? (
          <span className="text-green-400 text-sm">
            Playing ({formatElapsedTime(entry.started_at!)})
          </span>
        ) : (
          <span className="text-gray-500 text-sm">
            {entry.sessions_played} sessions
          </span>
        )}
      </td>
    </tr>
  );
}
