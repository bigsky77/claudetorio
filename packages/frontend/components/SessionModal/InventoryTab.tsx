import type { InventoryData } from '@/interfaces';

export default function InventoryTab({
  data,
  isLive,
  onRefresh,
}: {
  data: InventoryData;
  isLive: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-lg p-4 text-center">
        <div className="text-4xl font-bold text-purple-400">{data.total}</div>
        <div className="text-gray-400">Total Items</div>
      </div>
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-bold mb-3 text-gray-300">Inventory Contents</h3>
        {Object.keys(data.items).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {Object.entries(data.items)
              .sort(([, a], [, b]) => b - a)
              .map(([name, count]) => (
                <div key={name} className="flex justify-between bg-gray-800 rounded px-2 py-1 text-sm">
                  <span className="text-gray-400 truncate">{name}</span>
                  <span className="text-white font-mono ml-2">{count}</span>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Inventory is empty</p>
        )}
      </div>
      {isLive && (
        <button onClick={onRefresh} className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded">
          Refresh
        </button>
      )}
    </div>
  );
}
