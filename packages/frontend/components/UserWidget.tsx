'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useEscapeKey } from '@/hooks/use-escape-key';
import { API_BASE } from '@/constants';
import ApiKeyManager from './ApiKeyManager';

export default function UserWidget() {
  const { data: session, status } = useSession();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEscapeKey(() => setShowSignInModal(false));

  // Register user with broker on first sign-in
  useEffect(() => {
    if (session?.user && session.oauth_provider && session.oauth_id) {
      fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oauth_provider: session.oauth_provider,
          oauth_id: session.oauth_id,
          email: session.user.email,
          display_name: session.user.name,
          avatar_url: session.user.image,
        }),
      }).catch((err) => console.error('Failed to register with broker:', err));
    }
  }, [session]);

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

  if (status === 'loading') {
    return (
      <div className="fixed top-4 left-4 z-50">
        <div className="w-10 h-10 rounded-full bg-gray-700 animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <div className="fixed top-4 left-4 z-50">
          <button
            onClick={() => setShowSignInModal(true)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg
                       text-sm font-medium border border-gray-600 transition-colors"
          >
            Sign In
          </button>
        </div>

        {/* Sign In Modal */}
        {showSignInModal && (
          <div
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
            onClick={() => setShowSignInModal(false)}
          >
            <div
              className="bg-gray-800 rounded-lg p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Sign In</h2>
                <button
                  onClick={() => setShowSignInModal(false)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-full text-xl leading-none transition-colors"
                >
                  &times;
                </button>
              </div>

              <p className="text-gray-400 text-sm mb-6">
                Sign in to save your API keys and track your runs.
              </p>

              <button
                onClick={() => signIn('github')}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-900 hover:bg-gray-700 border border-gray-600 rounded-lg text-white font-medium transition-colors"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                Continue with GitHub
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="fixed top-4 left-4 z-50" ref={ref}>
      {/* Avatar button */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-600
                   hover:border-orange-400 transition-colors focus:outline-none"
      >
        {session.user?.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || 'User'}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-orange-600 flex items-center justify-center text-white font-bold">
            {(session.user?.name || '?')[0].toUpperCase()}
          </div>
        )}
      </button>

      {/* Dropdown menu */}
      {dropdownOpen && (
        <div className="absolute top-12 left-0 w-72 bg-gray-800 border border-gray-700
                        rounded-lg shadow-xl overflow-hidden">
          {/* User info header */}
          <div className="p-4 border-b border-gray-700">
            <div className="font-medium text-white">
              {session.user?.name || 'Anonymous'}
            </div>
            <div className="text-sm text-gray-400 truncate">
              {session.user?.email}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              via GitHub
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <button
              onClick={() => setShowApiKeys(!showApiKeys)}
              className="w-full text-left px-4 py-2 text-sm text-gray-300
                         hover:bg-gray-700 hover:text-white transition-colors"
            >
              {showApiKeys ? 'Hide' : 'Manage'} API Keys
            </button>

            {showApiKeys && (
              <div className="px-4 py-2 border-t border-gray-700">
                <ApiKeyManager />
              </div>
            )}

            <button
              onClick={() => {
                signOut();
                setDropdownOpen(false);
              }}
              className="w-full text-left px-4 py-2 text-sm text-red-400
                         hover:bg-gray-700 hover:text-red-300 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
