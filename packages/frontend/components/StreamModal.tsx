'use client';

import { useEscapeKey } from '@/hooks/use-escape-key';

export default function StreamModal({
  username,
  streamUrl,
  onClose,
  onViewDetails,
}: {
  username: string;
  streamUrl: string;
  onClose: () => void;
  onViewDetails: () => void;
}) {
  useEscapeKey(onClose);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="relative w-full h-full max-w-7xl max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gray-800/80 backdrop-blur rounded-t-lg">
          <div className="flex items-center">
            <span className="w-3 h-3 bg-green-500 rounded-full mr-3 animate-pulse"></span>
            <h2 className="text-xl font-bold">Watching: {username}</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onViewDetails}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            >
              View Details
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-full text-2xl leading-none transition-colors"
              title="Close (Esc)"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Stream iframe */}
        <div className="flex-1 bg-black rounded-b-lg overflow-hidden">
          <iframe
            src={streamUrl}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen"
            title={`Live stream: ${username}`}
          />
        </div>
      </div>
    </div>
  );
}
