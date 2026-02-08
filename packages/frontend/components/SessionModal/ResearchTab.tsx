import type { ResearchData } from '@/interfaces';

export default function ResearchTab({
  data,
  isLive,
  onRefresh,
}: {
  data: ResearchData;
  isLive: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-bold mb-2 text-gray-300">Current Research</h3>
        {data.current_research ? (
          <div>
            <div className="text-xl text-blue-400">{data.current_research}</div>
            <div className="mt-2 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500"
                style={{ width: `${data.progress * 100}%` }}
              />
            </div>
            <div className="text-sm text-gray-400 mt-1">
              {(data.progress * 100).toFixed(1)}% complete
            </div>
          </div>
        ) : (
          <p className="text-gray-500">No research in progress</p>
        )}
      </div>
      <div className="bg-gray-900 rounded-lg p-4">
        <h3 className="font-bold mb-3 text-gray-300">
          Researched Technologies ({data.researched.length})
        </h3>
        {data.researched.length > 0 ? (
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {data.researched.map((tech) => (
              <span key={tech} className="bg-green-900/50 text-green-400 px-2 py-1 rounded text-sm">
                {tech}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No technologies researched yet</p>
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
