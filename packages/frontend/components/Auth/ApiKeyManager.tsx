'use client';

import { useState } from 'react';
import { getApiKeys, saveApiKeys, clearApiKeys, type StoredApiKeys } from '@/utils/api-keys';

export default function ApiKeyManager() {
  const [keys, setKeys] = useState<StoredApiKeys>(() => getApiKeys());
  const [saved, setSaved] = useState(false);

  function handleSave() {
    saveApiKeys(keys);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    clearApiKeys();
    setKeys({ anthropic: '', openai: '', custom: { url: '', key: '' } });
  }

  const inputClass =
    'w-full bg-surface-0 border border-surface-3 px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-accent-green';

  return (
    <div className="space-y-2">
      <div>
        <label className="block text-xs text-white/40 mb-0.5">Anthropic Key</label>
        <input
          type="password"
          value={keys.anthropic}
          onChange={(e) => setKeys({ ...keys, anthropic: e.target.value })}
          placeholder="sk-ant-..."
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs text-white/40 mb-0.5">OpenAI Key</label>
        <input
          type="password"
          value={keys.openai}
          onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
          placeholder="sk-..."
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs text-white/40 mb-0.5">Custom API URL</label>
        <input
          type="text"
          value={keys.custom.url}
          onChange={(e) => setKeys({ ...keys, custom: { ...keys.custom, url: e.target.value } })}
          placeholder="https://..."
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-xs text-white/40 mb-0.5">Custom API Key</label>
        <input
          type="password"
          value={keys.custom.key}
          onChange={(e) => setKeys({ ...keys, custom: { ...keys.custom, key: e.target.value } })}
          placeholder="Optional"
          className={inputClass}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 px-2 py-1 bg-accent-green text-black text-xs font-medium transition-colors hover:opacity-80"
        >
          {saved ? 'Saved!' : 'Save Keys'}
        </button>
        <button
          onClick={handleClear}
          className="px-2 py-1 bg-surface-3 text-white/60 text-xs transition-colors hover:text-white/80"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
