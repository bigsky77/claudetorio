import type { Metadata } from 'next';
import Dashboard from '@/components/Dashboard';

export const metadata: Metadata = {
  title: { absolute: 'Claudetorio - Dashboard' },
};

export default function DashboardPage() {
  return <Dashboard />;
}
