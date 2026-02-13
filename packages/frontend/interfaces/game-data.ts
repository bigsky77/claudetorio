export interface FactoryData {
  total_entities: number;
  entity_counts: Record<string, number>;
  has_water: boolean;
  error?: string;
}

export interface InventoryData {
  items: Record<string, number>;
  total: number;
  error?: string;
}

export interface ResearchData {
  current_research: string | null;
  progress: number;
  researched: string[];
  error?: string;
}

export interface ProductionData {
  produced: Record<string, number>;
  consumed: Record<string, number>;
  net: Record<string, number>;
  error?: string;
}

export interface EntitiesData {
  entities: Array<{ name: string; position: { x: number; y: number }; direction: number }>;
  total: number;
  error?: string;
}

export type TabType = 'factory' | 'entities' | 'inventory' | 'research' | 'production' | 'score' | 'download';
