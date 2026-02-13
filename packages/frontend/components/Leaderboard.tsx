import type { UnifiedLeaderboardEntry, SelectedSession } from '@/interfaces';
import LeaderboardRow from './LeaderboardRow';

export default function Leaderboard({
  unifiedLeaderboard,
  onSelectSession,
}: {
  unifiedLeaderboard: UnifiedLeaderboardEntry[];
  onSelectSession: (session: SelectedSession) => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Leaderboard</h2>
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">Rank</th>
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-4 py-3 text-right">Score</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {unifiedLeaderboard.map((entry, index) => (
              <LeaderboardRow
                key={entry.username}
                entry={entry}
                rank={index + 1}
                onClick={() => entry.session_id ? onSelectSession({
                  sessionId: entry.session_id,
                  username: entry.username,
                  isLive: entry.isLive,
                }) : undefined}
              />
            ))}
            {unifiedLeaderboard.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No scores yet. Be the first to play!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
