import { getDownloadUrl } from '@/services/api';

export default function DownloadTab({
  sessionId,
  isLive,
}: {
  sessionId: string;
  isLive: boolean;
}) {
  const handleDownload = () => {
    if (!isLive) {
      alert('Downloads only available for live sessions');
      return;
    }
    window.open(getDownloadUrl(sessionId), '_blank');
  };

  return (
    <div className="text-center py-8">
      {isLive ? (
        <>
          <p className="text-gray-400 mb-4">
            Download the current game state as a save file.
          </p>
          <button
            onClick={handleDownload}
            className="px-6 py-3 bg-orange-500 hover:bg-orange-600 rounded-lg font-medium"
          >
            Download Save (.zip)
          </button>
        </>
      ) : (
        <p className="text-gray-400">
          Downloads are only available for active sessions.
        </p>
      )}
    </div>
  );
}
