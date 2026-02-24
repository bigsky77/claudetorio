import type { Metadata } from 'next';
import Dashboard from '@/components/Dashboard';

export const metadata: Metadata = {
  title: { absolute: 'Claudetorio - APP' },
};

export default function ArenaPage() {
  return <Dashboard />;
}
