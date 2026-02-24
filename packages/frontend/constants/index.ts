import { TabType } from '@/interfaces';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
export const REFRESH_INTERVAL_MS = 5000;
export const TICK_INTERVAL_MS = 1000;
export const RUN_POLL_INTERVAL_MS = 15000;

export const SESSION_TABS: TabType[] = [
  'score',
  'inventory',
  'research',
  'production',
  'factory',
  'entities',
  'download',
];
