'use client';

import { SESSION_TABS } from '@/constants';
import { useSessionTabs } from '@/hooks/use-session-tabs';
import ScoreTab from './ScoreTab';
import InventoryTab from './InventoryTab';
import ResearchTab from './ResearchTab';
import ProductionTab from './ProductionTab';
import FactoryTab from './FactoryTab';
import EntitiesTab from './EntitiesTab';
import DownloadTab from './DownloadTab';

export default function SessionModal({
  sessionId,
  username,
  isLive,
  onClose,
}: {
  sessionId: string;
  username: string;
  isLive: boolean;
  onClose: () => void;
}) {
  const {
    activeTab,
    setActiveTab,
    loading,
    error,
    factoryData,
    scoreData,
    inventoryData,
    researchData,
    productionData,
    entitiesData,
    refreshCurrentTab,
  } = useSessionTabs(sessionId, isLive);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold flex items-center">
              {isLive && <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>}
              {username}
            </h2>
            <p className="text-sm text-gray-400">Session: {sessionId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 overflow-x-auto">
          {SESSION_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 font-medium capitalize whitespace-nowrap ${
                activeTab === tab
                  ? 'text-orange-400 border-b-2 border-orange-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
          {loading && <div className="text-gray-400 py-8 text-center">Loading...</div>}
          {error && <div className="text-red-400 py-8 text-center">{error}</div>}

          {activeTab === 'score' && !loading && scoreData && (
            <ScoreTab data={scoreData} isLive={isLive} onRefresh={refreshCurrentTab} />
          )}
          {activeTab === 'inventory' && !loading && inventoryData && (
            <InventoryTab data={inventoryData} isLive={isLive} onRefresh={refreshCurrentTab} />
          )}
          {activeTab === 'research' && !loading && researchData && (
            <ResearchTab data={researchData} isLive={isLive} onRefresh={refreshCurrentTab} />
          )}
          {activeTab === 'production' && !loading && productionData && (
            <ProductionTab data={productionData} isLive={isLive} onRefresh={refreshCurrentTab} />
          )}
          {activeTab === 'factory' && !loading && factoryData && (
            <FactoryTab data={factoryData} isLive={isLive} onRefresh={refreshCurrentTab} />
          )}
          {activeTab === 'entities' && !loading && entitiesData && (
            <EntitiesTab data={entitiesData} isLive={isLive} onRefresh={refreshCurrentTab} />
          )}
          {activeTab === 'download' && (
            <DownloadTab sessionId={sessionId} isLive={isLive} />
          )}
        </div>
      </div>
    </div>
  );
}
