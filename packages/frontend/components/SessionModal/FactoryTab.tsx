import type { FactoryData } from '@/interfaces';

export default function FactoryTab({
  data,
  isLive,
  onRefresh,
}: {
  data: FactoryData;
  isLive: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-lg p-4 text-center">
        <div className="text-4xl font-bold text-blue-400">{data.total_entities}</div>
        <div className="text-gray-400">Total Entities</div>
      </div>
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-bold mb-3 text-gray-300">Entity Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          {Object.entries(data.entity_counts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 30)
            .map(([name, count]) => (
              <div key={name} className="flex justify-between bg-gray-800 rounded px-2 py-1 text-sm">
                <span className="text-gray-400 truncate">{name}</span>
                <span className="text-white font-mono ml-2">{count}</span>
              </div>
            ))}
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
