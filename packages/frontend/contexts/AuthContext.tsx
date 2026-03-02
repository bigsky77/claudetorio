'use client';

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { API_BASE } from '@/constants';
import type { AuthUser } from '@/interfaces';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithGitHub: () => Promise<void>;
  handleCallback: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'claudetorio_jwt';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !!localStorage.getItem(TOKEN_KEY);
  });

  const fetchMe = useCallback(async (token: string): Promise<AuthUser | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.user;
    } catch {
      return null;
    }
  }, []);

  // On mount, check for existing token
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      return;
    }
    fetchMe(token).then((u) => {
      if (cancelled) return;
      setUser(u);
      if (!u) localStorage.removeItem(TOKEN_KEY);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [fetchMe]);

  const loginWithGitHub = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/auth/github`);
    if (!res.ok) return;
    const data = await res.json();
    window.location.href = data.url;
  }, []);

  const handleCallback = useCallback(async (token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    const u = await fetchMe(token);
    setUser(u);
  }, [fetchMe]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        loginWithGitHub,
        handleCallback,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
