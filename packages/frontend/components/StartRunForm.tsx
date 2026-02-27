'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEscapeKey } from '@/hooks/use-escape-key';
import { createRun } from '@/services/api';

type Provider = 'anthropic' | 'openai' | 'custom';
type StoredFormData = Partial<{
  provider: Provider;
  model: string;
  taskKey: string;
  maxSteps: number;
  apiKey: string;
  customApiUrl: string;
  customApiKey: string;
}>;

const PROVIDER_DEFAULTS: Record<Provider, string> = {
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-4.1',
  custom: '',
};

const FORM_STORAGE_KEY = 'claudetorio.startRunForm.v1';

function isProvider(value: unknown): value is Provider {
  return value === 'anthropic' || value === 'openai' || value === 'custom';
}

function readStoredFormData(): StoredFormData | null {
  if (typeof window === 'undefined') return null;

  const stored = localStorage.getItem(FORM_STORAGE_KEY);
  if (!stored) return null;

  try {
    return JSON.parse(stored) as StoredFormData;
  } catch {
    localStorage.removeItem(FORM_STORAGE_KEY);
    return null;
  }
}

export default function StartRunForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>(() => {
    const stored = readStoredFormData();
    return isProvider(stored?.provider) ? stored.provider : 'anthropic';
  });
  const [model, setModel] = useState(() => {
    const stored = readStoredFormData();
    const storedProvider = isProvider(stored?.provider) ? stored.provider : 'anthropic';
    return typeof stored?.model === 'string' ? stored.model : PROVIDER_DEFAULTS[storedProvider];
  });
  const [taskKey, setTaskKey] = useState(() => {
    const stored = readStoredFormData();
    return typeof stored?.taskKey === 'string' ? stored.taskKey : 'open_play';
  });
  const [maxSteps, setMaxSteps] = useState(() => {
    const stored = readStoredFormData();
    return typeof stored?.maxSteps === 'number' && stored.maxSteps > 0 ? stored.maxSteps : 200;
  });
  const [apiKey, setApiKey] = useState(() => {
    const stored = readStoredFormData();
    return typeof stored?.apiKey === 'string' ? stored.apiKey : '';
  });
  const [customApiUrl, setCustomApiUrl] = useState(() => {
    const stored = readStoredFormData();
    return typeof stored?.customApiUrl === 'string' ? stored.customApiUrl : '';
  });
  const [customApiKey, setCustomApiKey] = useState(() => {
    const stored = readStoredFormData();
    return typeof stored?.customApiKey === 'string' ? stored.customApiKey : '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(onClose);

  useEffect(() => {
    localStorage.setItem(
      FORM_STORAGE_KEY,
      JSON.stringify({
        provider,
        model,
        taskKey,
        maxSteps,
        apiKey,
        customApiUrl,
        customApiKey,
      }),
    );
  }, [provider, model, taskKey, maxSteps, apiKey, customApiUrl, customApiKey]);

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
        provider,
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
