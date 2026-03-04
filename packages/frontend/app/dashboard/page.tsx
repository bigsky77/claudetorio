import type { Metadata } from 'next';

import DashboardPage from '@/components/Dashboard/DashboardPage';
import { fetchRuns, fetchStatus } from '@/services/api';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default async function DashboardRoute() {
  const brokerUrl = process.env.BROKER_URL || process.env.NEXT_PUBLIC_API_URL || '';
  const baseUrl = brokerUrl || undefined;

  // Server-side fetch for fast first paint; client polls for freshness.
  const [initialRuns, initialStatus] = await Promise.all([
    fetchRuns({ limit: 200, baseUrl }),
    baseUrl ? fetchStatus(baseUrl).catch(() => null) : Promise.resolve(null),
  ]);

  return <DashboardPage initialRuns={initialRuns} initialStatus={initialStatus} />;
}
