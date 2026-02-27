'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { API_BASE } from '@/constants';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthCallbackPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { handleCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('No authorization code received');
      return;
    }

    let cancelled = false;

    async function exchange() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/github/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (cancelled) return;
        await handleCallback(data.token);
        router.push('/');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    }

    exchange();
    return () => { cancelled = true; };
  }, [searchParams, handleCallback, router]);

  if (error) {
    return (
      <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-400">Authentication failed: {error}</p>
          <Link href="/" className="text-accent-green hover:opacity-80 transition-opacity">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-0 text-white font-[family-name:var(--font-body)] flex items-center justify-center">
      <p className="text-white/60">Authenticating...</p>
    </main>
  );
}
