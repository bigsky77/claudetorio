import { useState, useCallback, useEffect } from 'react';
import { API_BASE } from '@/constants';
import type {
  TabType,
  FactoryData,
  SessionScore,
  InventoryData,
  ResearchData,
  ProductionData,
  EntitiesData,
} from '@/interfaces';

export function useSessionTabs(sessionId: string, isLive: boolean) {
  const [activeTab, setActiveTab] = useState<TabType>('score');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [factoryData, setFactoryData] = useState<FactoryData | null>(null);
  const [scoreData, setScoreData] = useState<SessionScore | null>(null);
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [researchData, setResearchData] = useState<ResearchData | null>(null);
  const [productionData, setProductionData] = useState<ProductionData | null>(null);
  const [entitiesData, setEntitiesData] = useState<EntitiesData | null>(null);

  const fetchData = useCallback(async (endpoint: string) => {
    if (!isLive && endpoint !== 'score') {
      setError('Data only available for live sessions');
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/session/${sessionId}/${endpoint}`);
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return null;
        }
        return data;
      } else {
        setError(`Failed to load ${endpoint} data`);
        return null;
      }
    } catch {
      setError(`Failed to load ${endpoint} data`);
      return null;
    } finally {
      setLoading(false);
    }
  }, [sessionId, isLive]);

  useEffect(() => {
    const loadTabData = async () => {
      switch (activeTab) {
        case 'factory':
          if (!factoryData) {
            const data = await fetchData('factory');
            if (data) setFactoryData(data);
          }
          break;
        case 'score':
          if (!scoreData) {
            const data = await fetchData('score');
            if (data) setScoreData(data);
          }
          break;
        case 'inventory':
          if (!inventoryData) {
            const data = await fetchData('inventory');
            if (data) setInventoryData(data);
          }
          break;
        case 'research':
          if (!researchData) {
            const data = await fetchData('research');
            if (data) setResearchData(data);
          }
          break;
        case 'production':
          if (!productionData) {
            const data = await fetchData('production');
            if (data) setProductionData(data);
          }
          break;
        case 'entities':
          if (!entitiesData) {
            const data = await fetchData('entities');
            if (data) setEntitiesData(data);
          }
          break;
      }
    };
    loadTabData();
  }, [activeTab, factoryData, scoreData, inventoryData, researchData, productionData, entitiesData, fetchData]);

  const refreshCurrentTab = async () => {
    switch (activeTab) {
      case 'factory': setFactoryData(null); break;
      case 'score': setScoreData(null); break;
      case 'inventory': setInventoryData(null); break;
      case 'research': setResearchData(null); break;
      case 'production': setProductionData(null); break;
      case 'entities': setEntitiesData(null); break;
    }
  };

  return {
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
  };
}
