import type { SessionScore } from '@/interfaces';

export default function ScoreTab({
  data,
  isLive,
  onRefresh,
}: {
  data: SessionScore;
  isLive: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-lg p-6 text-center">
        <div className="text-5xl font-bold text-orange-400 font-mono">
          {data.score.toLocaleString()}
        </div>
        <div className="text-gray-400 mt-2">Production Score</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="text-2xl font-bold text-blue-400">
            {data.playtime_formatted}
          </div>
          <div className="text-gray-400 text-sm">Playtime</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400 capitalize">
            {data.status}
          </div>
          <div className="text-gray-400 text-sm">Status</div>
        </div>
      </div>
      {isLive && (
        <button onClick={onRefresh} className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
          Refresh
        </button>
      )}
    </div>
  );
}
