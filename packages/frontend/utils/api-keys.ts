const STORAGE_KEY = 'claudetorio_api_keys';

export interface StoredApiKeys {
  anthropic: string;
  openai: string;
  custom: {
    url: string;
    key: string;
  };
}

const DEFAULT_KEYS: StoredApiKeys = {
  anthropic: '',
  openai: '',
  custom: { url: '', key: '' },
};

export function getApiKeys(): StoredApiKeys {
  if (typeof window === 'undefined') return DEFAULT_KEYS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_KEYS;
    const parsed = JSON.parse(raw);
    return {
      anthropic: parsed.anthropic || '',
      openai: parsed.openai || '',
      custom: {
        url: parsed.custom?.url || '',
        key: parsed.custom?.key || '',
      },
    };
  } catch {
    return DEFAULT_KEYS;
  }
}

export function saveApiKeys(keys: StoredApiKeys): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function clearApiKeys(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
