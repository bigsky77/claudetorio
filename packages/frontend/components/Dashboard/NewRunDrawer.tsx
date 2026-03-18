'use client';

import { useEffect, useMemo, useState } from 'react';

import type { RunInfo } from '@/interfaces';
import { createRun } from '@/services/api';
import { getApiKeys } from '@/utils/api-keys';

type ProviderUi = 'claude' | 'chatgpt' | 'other';

function providerToApi(p: ProviderUi): 'anthropic' | 'openai' | 'custom' {
  if (p === 'claude') return 'anthropic';
  if (p === 'chatgpt') return 'openai';
  return 'custom';
}

export default function NewRunDrawer(props: {
  open: boolean;
  onClose: () => void;
  onCreated: (run: Pick<RunInfo, 'run_id' | 'status'>) => void;
}) {
  const { open, onClose, onCreated } = props;

  const [providerUi, setProviderUi] = useState<ProviderUi>('claude');
  const [model, setModel] = useState('claude-sonnet-4-5-20250929');
  const [taskKey, setTaskKey] = useState('open_play');
  const [maxSteps, setMaxSteps] = useState(200);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stepTimeoutSeconds, setStepTimeoutSeconds] = useState(60);
  const [apiKey, setApiKey] = useState('');
  const [customApiUrl, setCustomApiUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');

  const [manual, setManual] = useState(false);
  const [rconResult, setRconResult] = useState<{ run_id: string; rcon_host: string; rcon_port: number; rcon_password: string } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerApi = useMemo(() => providerToApi(providerUi), [providerUi]);

  // Auto-fill from saved API keys on mount
  useEffect(() => {
    const saved = getApiKeys();
    if (saved.anthropic && providerUi === 'claude') setApiKey(saved.anthropic);
    else if (saved.openai && providerUi === 'chatgpt') setApiKey(saved.openai);
    if (saved.custom.url) setCustomApiUrl(saved.custom.url);
    if (saved.custom.key) setCustomApiKey(saved.custom.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyProviderDefaults(next: ProviderUi) {
    setProviderUi(next);
    setError(null);
    if (next === 'claude') setModel('claude-sonnet-4-5-20250929');
    if (next === 'chatgpt') setModel('gpt-4.1');
    if (next === 'other') setModel('');
    // Load the matching saved key for the selected provider
    const saved = getApiKeys();
    if (next === 'claude') setApiKey(saved.anthropic);
    else if (next === 'chatgpt') setApiKey(saved.openai);
    else setApiKey('');
  }

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body: Parameters<typeof createRun>[0] = {
        task_key: taskKey || 'open_play',
        max_steps: Number.isFinite(maxSteps) ? maxSteps : 200,
        step_timeout_seconds: Number.isFinite(stepTimeoutSeconds) ? stepTimeoutSeconds : 60,
        manual,
      };

      if (!manual) {
        body.provider = providerApi;
        body.model = model || undefined;
        if (providerApi === 'custom') {
          if (!customApiUrl) throw new Error('Custom API URL required');
          body.custom_api_url = customApiUrl;
          if (customApiKey) body.custom_api_key = customApiKey;
        } else {
          if (!apiKey) throw new Error('API key required — save one in your account settings');
          body.api_key = apiKey;
        }
      }

      const res = await createRun(body);
      onCreated({ run_id: res.run_id, status: res.status });

      if (manual && res.rcon_host && res.rcon_port && res.rcon_password) {
        setRconResult({ run_id: res.run_id, rcon_host: res.rcon_host, rcon_port: res.rcon_port, rcon_password: res.rcon_password });
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />

      <div className="absolute right-0 top-0 h-full w-full max-w-[520px] bg-surface-1 border-l border-surface-3 shadow-2xl">
        <div className="h-full flex flex-col">
          <div className="px-6 py-4 border-b border-surface-3 flex items-center justify-between">
            <div className="font-[family-name:var(--font-heading)] font-bold tracking-wide text-white">
              New Run
            </div>
            <button
              onClick={onClose}
              className="text-white/50 hover:text-white/80 transition-colors text-sm"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">
            {/* Manual mode toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => { setManual((v) => !v); setError(null); setRconResult(null); }}
                className={`relative w-9 h-5 rounded-full transition-colors ${manual ? 'bg-accent-green' : 'bg-surface-3'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${manual ? 'translate-x-4' : ''}`} />
              </div>
              <div>
                <div className="text-white/90 text-xs font-semibold tracking-wide">Manual mode</div>
                <div className="text-white/40 text-xs">Skip AI worker — connect directly via RCON</div>
              </div>
            </label>

            {/* RCON result for manual runs */}
            {rconResult && (
              <div className="bg-surface-2 border border-accent-green/30 px-4 py-3 space-y-2">
                <div className="text-accent-green text-xs font-semibold tracking-widest">RCON Credentials</div>
                {[
                  ['Run ID', rconResult.run_id],
                  ['Host', rconResult.rcon_host],
                  ['Port', String(rconResult.rcon_port)],
                  ['Password', rconResult.rcon_password],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 text-xs">
                    <span className="text-white/50">{label}</span>
                    <span className="text-white/90 font-mono break-all text-right">{value}</span>
                  </div>
                ))}
              </div>
            )}

            {!manual && (<>
            {/* Provider */}
            <div className="space-y-2">
              <div className="text-white/60 text-xs font-semibold tracking-widest font-[family-name:var(--font-heading)]">
                Provider
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => applyProviderDefaults('claude')}
                  className={`h-10 border text-xs font-semibold tracking-wide transition-colors ${
                    providerUi === 'claude'
                      ? 'bg-accent-green/15 border-accent-green/30 text-accent-green'
                      : 'bg-surface-2 border-surface-3 text-white/70 hover:text-white'
                  }`}
                >
                  Claude
                </button>
                <button
                  onClick={() => applyProviderDefaults('chatgpt')}
                  className={`h-10 border text-xs font-semibold tracking-wide transition-colors ${
                    providerUi === 'chatgpt'
                      ? 'bg-accent-green/15 border-accent-green/30 text-accent-green'
                      : 'bg-surface-2 border-surface-3 text-white/70 hover:text-white'
                  }`}
                >
                  ChatGPT
                </button>
                <button
                  onClick={() => applyProviderDefaults('other')}
                  className={`h-10 border text-xs font-semibold tracking-wide transition-colors ${
                    providerUi === 'other'
                      ? 'bg-accent-green/15 border-accent-green/30 text-accent-green'
                      : 'bg-surface-2 border-surface-3 text-white/70 hover:text-white'
                  }`}
                >
                  Other
                </button>
              </div>
            </div>

            {/* Model */}
            <div className="space-y-2">
              <div className="text-white/60 text-xs font-semibold tracking-widest font-[family-name:var(--font-heading)]">
                Model
              </div>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={providerUi === 'other' ? 'model-id' : ''}
                className="w-full h-10 px-3 bg-surface-2 border border-surface-3 text-white/90 text-sm outline-none focus:border-accent-green/40"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-white/60 text-xs font-semibold tracking-widest font-[family-name:var(--font-heading)]">
                  Task
                </div>
                <input
                  value={taskKey}
                  onChange={(e) => setTaskKey(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-2 border border-surface-3 text-white/90 text-sm outline-none focus:border-accent-green/40"
                />
              </div>
              <div className="space-y-2">
                <div className="text-white/60 text-xs font-semibold tracking-widest font-[family-name:var(--font-heading)]">
                  Steps
                </div>
                <input
                  type="number"
                  value={maxSteps}
                  onChange={(e) => setMaxSteps(parseInt(e.target.value || '0', 10))}
                  className="w-full h-10 px-3 bg-surface-2 border border-surface-3 text-white/90 text-sm outline-none focus:border-accent-green/40"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowAdvanced((v) => !v)}
                className="text-white/60 hover:text-white/80 transition-colors text-xs font-semibold tracking-wide"
              >
                {showAdvanced ? 'Hide' : 'Show'} advanced
              </button>
            </div>

            {showAdvanced && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-white/60 text-xs font-semibold tracking-widest font-[family-name:var(--font-heading)]">
                    Step timeout (s)
                  </div>
                  <input
                    type="number"
                    value={stepTimeoutSeconds}
                    onChange={(e) => setStepTimeoutSeconds(parseInt(e.target.value || '0', 10))}
                    className="w-full h-10 px-3 bg-surface-2 border border-surface-3 text-white/90 text-sm outline-none focus:border-accent-green/40"
                  />
                </div>

                {providerApi === 'custom' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="text-white/60 text-xs font-semibold tracking-widest font-[family-name:var(--font-heading)]">
                        Custom API URL
                      </div>
                      <input
                        value={customApiUrl}
                        onChange={(e) => setCustomApiUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full h-10 px-3 bg-surface-2 border border-surface-3 text-white/90 text-sm outline-none focus:border-accent-green/40"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="text-white/60 text-xs font-semibold tracking-widest font-[family-name:var(--font-heading)]">
                        Custom API Key
                      </div>
                      <input
                        value={customApiKey}
                        onChange={(e) => setCustomApiKey(e.target.value)}
                        placeholder="(optional)"
                        className="w-full h-10 px-3 bg-surface-2 border border-surface-3 text-white/90 text-sm outline-none focus:border-accent-green/40"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            </>)}

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 px-3 py-2 text-red-200 text-xs">
                {error}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-surface-3">
            {rconResult ? (
              <button
                onClick={onClose}
                className="w-full h-11 bg-surface-2 border border-surface-3 text-white/80 font-[family-name:var(--font-heading)] font-bold tracking-wide text-sm hover:text-white transition-colors"
              >
                Close
              </button>
            ) : (
              <button
                onClick={onSubmit}
                disabled={submitting}
                className="w-full h-11 bg-accent-green text-black font-[family-name:var(--font-heading)] font-bold tracking-wide text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {submitting ? 'Creating...' : 'Create run'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
