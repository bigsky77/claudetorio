import type { EntitiesData } from '@/interfaces';

export default function EntitiesTab({
  data,
  isLive,
  onRefresh,
}: {
  data: EntitiesData;
  isLive: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-lg p-4 text-center">
        <div className="text-4xl font-bold text-cyan-400">{data.total}</div>
        <div className="text-gray-400">Total Entities (showing first 200)</div>
      </div>
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-bold mb-3 text-gray-300">Entity List</h3>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left py-1">Name</th>
                <th className="text-right py-1">X</th>
                <th className="text-right py-1">Y</th>
              </tr>
            </thead>
            <tbody>
              {data.entities.slice(0, 100).map((entity, i) => (
                <tr key={i} className="border-t border-gray-700">
                  <td className="py-1 text-gray-300">{entity.name}</td>
                  <td className="py-1 text-right font-mono text-gray-400">
                    {entity.position.x?.toFixed(1)}
                  </td>
                  <td className="py-1 text-right font-mono text-gray-400">
                    {entity.position.y?.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
