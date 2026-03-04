'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LoginWidget from '@/components/Auth/LoginWidget';

const NAV = [
  { label: 'STREAMS', href: '/' },
  { label: 'MARKETS', href: '/market' },
  { label: 'DASHBOARD', href: '/dashboard' },
] as const;

export default function NavHeader({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="h-14 bg-surface-1 border-b border-surface-3 grid grid-cols-3 items-center px-8">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          className="font-[family-name:var(--font-heading)] font-bold text-lg tracking-wide text-white hover:opacity-80 transition-opacity"
        >
          CLAUDETORIO
        </Link>
        {children}
      </div>
      <nav className="flex items-center justify-center gap-6">
        {NAV.map(({ label, href }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`font-[family-name:var(--font-heading)] text-xs font-semibold tracking-widest transition-opacity ${
                active ? 'text-white' : 'text-white/30 hover:text-white/60'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-end">
        <LoginWidget />
      </div>
    </header>
  );
}
