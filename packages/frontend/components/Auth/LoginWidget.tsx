'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import ApiKeyManager from './ApiKeyManager';

export default function LoginWidget() {
  const { user, loading, isAuthenticated, loginWithGitHub, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setShowApiKeys(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) return null;

  if (isAuthenticated && user) {
    return (
      <div className="relative" ref={ref}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          {user.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatar_url}
              alt=""
              className="w-6 h-6 rounded-full"
            />
          )}
          <span className="text-white/80 text-sm">{user.github_username}</span>
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-8 w-72 bg-surface-1 border border-surface-3 shadow-xl z-50">
            {/* User info */}
            <div className="p-3 border-b border-surface-3">
              <div className="text-sm text-white font-medium">{user.github_username}</div>
              {user.email && (
                <div className="text-xs text-white/40 truncate">{user.email}</div>
              )}
            </div>

            {/* Menu */}
            <div className="py-1">
              <button
                onClick={() => setShowApiKeys(!showApiKeys)}
                className="w-full text-left px-3 py-2 text-sm text-white/60 hover:bg-surface-2 hover:text-white transition-colors"
              >
                {showApiKeys ? 'Hide' : 'Manage'} API Keys
              </button>

              {showApiKeys && (
                <div className="px-3 py-2 border-t border-surface-3">
                  <ApiKeyManager />
                </div>
              )}

              <button
                onClick={() => {
                  logout();
                  setDropdownOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-surface-2 hover:text-red-300 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={loginWithGitHub}
      className="text-accent-green font-semibold text-sm hover:opacity-80 transition-opacity"
    >
      Login
    </button>
  );
}
