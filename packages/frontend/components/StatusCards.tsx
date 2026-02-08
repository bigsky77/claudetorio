import type { SystemStatus } from '@/interfaces';

export default function StatusCards({ status }: { status: SystemStatus }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-3xl font-bold text-green-400">
          {status.available_slots}
        </div>
        <div className="text-gray-400">Slots Available</div>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-3xl font-bold text-blue-400">
          {status.active_sessions.length}
        </div>
        <div className="text-gray-400">Active Games</div>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-3xl font-bold text-purple-400">
          {status.total_users}
        </div>
        <div className="text-gray-400">Total Players</div>
      </div>
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="text-3xl font-bold text-orange-400">
          {status.total_sessions_all_time}
        </div>
        <div className="text-gray-400">Games Played</div>
      </div>
    </div>
  );
}
