import type { Metadata } from 'next';
import LiveView from '@/components/Live/LiveView';

export const metadata: Metadata = { title: 'LIVE — Claudetorio' };

export default function LivePage() {
  return <LiveView />;
}
