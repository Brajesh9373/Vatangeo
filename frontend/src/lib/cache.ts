type Listener<T> = (data: T) => void;
type Fetcher<T> = () => Promise<T>;

interface CacheEntry<T> {
  data?: T;
  error?: Error;
  promise?: Promise<T>;
  listeners: Set<Listener<T>>;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function cachedFetch<T>(key: string, fetcher: Fetcher<T>): {
  read: () => { data: T | undefined; error: Error | undefined; loading: boolean };
  subscribe: (fn: Listener<T>) => () => void;
  refresh: () => Promise<void>;
  mutate: (data: T) => void;
} {
  let entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    entry = { listeners: new Set() };
    cache.set(key, entry as CacheEntry<unknown>);
  }

  if (!entry.promise && !entry.data && !entry.error) {
    entry.promise = fetcher()
      .then((data) => {
        entry!.data = data;
        entry!.promise = undefined;
        entry!.listeners.forEach((l) => l(data));
        return data;
      })
      .catch((e) => {
        entry!.error = e instanceof Error ? e : new Error(String(e));
        entry!.promise = undefined;
        throw e;
      });
  }

  return {
    read: () => ({ data: entry!.data, error: entry!.error, loading: !entry!.data && !entry!.error }),
    subscribe: (fn) => {
      entry!.listeners.add(fn);
      if (entry!.data) fn(entry!.data);
      return () => entry!.listeners.delete(fn);
    },
    refresh: async () => {
      entry!.promise = fetcher()
        .then((data) => {
          entry!.data = data;
          entry!.error = undefined;
          entry!.promise = undefined;
          entry!.listeners.forEach((l) => l(data));
          return data;
        })
        .catch((e) => {
          entry!.error = e instanceof Error ? e : new Error(String(e));
          entry!.promise = undefined;
          throw e;
        });
    },
    mutate: (data) => {
      entry!.data = data;
      entry!.error = undefined;
      entry!.listeners.forEach((l) => l(data));
    },
  };
}

export function invalidateCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
