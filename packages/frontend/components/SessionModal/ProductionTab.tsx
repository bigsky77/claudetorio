import type { ProductionData } from '@/interfaces';

export default function ProductionTab({
  data,
  isLive,
  onRefresh,
}: {
  data: ProductionData;
  isLive: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-bold mb-3 text-gray-300">Net Production (Produced - Consumed)</h3>
        {Object.keys(data.net).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
            {Object.entries(data.net)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 30)
              .map(([name, count]) => (
                <div key={name} className="flex justify-between bg-gray-800 rounded px-2 py-1 text-sm">
                  <span className="text-gray-400 truncate">{name}</span>
                  <span className={`font-mono ml-2 ${count > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {count > 0 ? '+' : ''}{count}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">No production data yet</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-bold mb-2 text-green-400">Produced</h3>
          <div className="text-2xl font-mono">{Object.keys(data.produced).length} items</div>
        </div>
        <div className="bg-gray-900 rounded-lg p-4">
          <h3 className="font-bold mb-2 text-red-400">Consumed</h3>
          <div className="text-2xl font-mono">{Object.keys(data.consumed).length} items</div>
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
