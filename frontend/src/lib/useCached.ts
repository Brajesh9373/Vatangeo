import { useEffect, useState, useSyncExternalStore } from 'react';
import { cachedFetch } from './cache';

export function useCached<T>(key: string, fetcher: () => Promise<T>) {
  const handler = cachedFetch(key, fetcher);
  const subscribe = (fn: () => void) => handler.subscribe(() => fn());
  const getSnapshot = () => handler.read().data;
  const getServerSnapshot = () => undefined as T | undefined;

  const data = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [{ error, loading }, setMeta] = useState(() => {
    const r = handler.read();
    return { error: r.error, loading: r.loading };
  });

  useEffect(() => {
    return handler.subscribe(() => {
      const r = handler.read();
      setMeta({ error: r.error, loading: r.loading });
    });
  }, [handler]);

  return { data, error, loading, refresh: handler.refresh, mutate: handler.mutate };
}
