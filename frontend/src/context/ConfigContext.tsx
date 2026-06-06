import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Provider, ConfigState } from '../types';
import { fetchConfig, saveConfig } from '../lib/api';

interface ConfigCtx extends ConfigState {
  setProvider: (p: Provider) => void;
  setModelName: (m: string) => void;
  setApiKey: (k: string) => void;
  setEndpoint: (e: string) => void;
  save: () => Promise<boolean>;
  test: () => Promise<'ok' | 'fail'>;
}

const ConfigContext = createContext<ConfigCtx | null>(null);

function loadInitial(): { provider: Provider; modelName: string; endpoint: string } {
  // Lazy init: only runs once on mount
  try {
    const stored = localStorage.getItem('vantageo-config-cache');
    if (stored) return JSON.parse(stored);
  } catch {}
  return { provider: 'commandcode', modelName: '', endpoint: '' };
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const init = loadInitial();
  const [provider, setProvider] = useState<Provider>(init.provider);
  const [modelName, setModelName] = useState(init.modelName);
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState(init.endpoint);
  const [isSaved, setIsSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');

  // Fetch persisted config from backend on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchConfig();
        if (cancelled) return;
        setProvider((cfg.provider as Provider) || 'commandcode');
        setModelName((curr) => curr || cfg.model || '');
        if (cfg.endpoint) setEndpoint(cfg.endpoint);
        setIsSaved(true);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist to localStorage when provider/model/endpoint change
  useEffect(() => {
    try {
      localStorage.setItem('vantageo-config-cache', JSON.stringify({ provider, modelName, endpoint }));
    } catch {}
  }, [provider, modelName, endpoint]);

  const save = useCallback(async (): Promise<boolean> => {
    try {
      await saveConfig({
        provider,
        model: modelName,
        api_key: apiKey,
        endpoint: endpoint || undefined,
      });
      setIsSaved(true);
      setTestStatus((s) => (s === 'testing' ? s : 'idle'));
      return true;
    } catch {
      setIsSaved(false);
      return false;
    }
  }, [provider, modelName, apiKey, endpoint]);

  const test = useCallback(async (): Promise<'ok' | 'fail'> => {
    setTestStatus('testing');
    try {
      await saveConfig({
        provider,
        model: modelName,
        api_key: apiKey,
        endpoint: endpoint || undefined,
      });
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      });
      setTestStatus(r.ok ? 'ok' : 'fail');
      return r.ok ? 'ok' : 'fail';
    } catch {
      setTestStatus('fail');
      return 'fail';
    }
  }, [provider, modelName, apiKey, endpoint]);

  return (
    <ConfigContext.Provider value={{
      provider, setProvider, modelName, setModelName,
      apiKey, setApiKey, endpoint, setEndpoint,
      isSaved, testStatus, save, test,
    }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigCtx {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be inside ConfigProvider');
  return ctx;
}
