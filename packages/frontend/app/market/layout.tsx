import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Markets' };

export default function MarketLayout({ children }: { children: React.ReactNode }) {
  return children;
}
