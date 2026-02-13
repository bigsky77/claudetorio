'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEscapeKey } from '@/hooks/use-escape-key';
import { createRun } from '@/services/api';

type Provider = 'anthropic' | 'openai' | 'custom';

const PROVIDER_DEFAULTS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4.1',
  custom: '',
};

export default function StartRunForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState(PROVIDER_DEFAULTS.anthropic);
  const [taskKey, setTaskKey] = useState('open_play');
  const [maxSteps, setMaxSteps] = useState(200);
  const [apiKey, setApiKey] = useState('');
  const [customApiUrl, setCustomApiUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose);

  function handleProviderChange(p: Provider) {
    setProvider(p);
    setModel(PROVIDER_DEFAULTS[p] || model);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const body: Parameters<typeof createRun>[0] = {
        model,
        task_key: taskKey,
        max_steps: maxSteps,
      };
      if (provider === 'custom') {
        if (customApiUrl) body.custom_api_url = customApiUrl;
        if (customApiKey) body.custom_api_key = customApiKey;
      } else if (apiKey) {
        body.api_key = apiKey;
      }
      const result = await createRun(body);
      router.push(`/run/${result.run_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create run');
      setLoading(false);
    }
  }

  const inputClass =
    'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-orange-500';

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Start New Run</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 rounded-full text-xl leading-none transition-colors"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Provider selector */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Provider</label>
            <div className="flex gap-2">
              {(['anthropic', 'openai', 'custom'] as Provider[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleProviderChange(p)}
                  className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    provider === p
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-900 text-gray-400 hover:text-gray-200 border border-gray-700'
                  }`}
                >
                  {p === 'anthropic' ? 'Anthropic' : p === 'openai' ? 'OpenAI' : 'Custom'}
                </button>
              ))}
            </div>
          </div>

          {/* API Key for Anthropic / OpenAI */}
          {provider !== 'custom' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                className={inputClass}
              />
            </div>
          )}

          {/* Custom provider fields */}
          {provider === 'custom' && (
            <>
              <div>
                <label className="block text-sm text-gray-400 mb-1">API URL</label>
                <input
                  type="text"
                  value={customApiUrl}
                  onChange={(e) => setCustomApiUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">API Key</label>
                <input
                  type="password"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Model</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Task</label>
            <input
              type="text"
              value={taskKey}
              onChange={(e) => setTaskKey(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Max Steps</label>
            <input
              type="number"
              value={maxSteps}
              onChange={(e) => setMaxSteps(Number(e.target.value))}
              min={1}
              className={inputClass}
            />
          </div>

          {error && (
            <div className="text-red-400 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed rounded px-4 py-2 font-medium transition-colors"
          >
            {loading ? 'Starting...' : 'Start Run'}
          </button>
        </form>
      </div>
    </div>
  );
}
