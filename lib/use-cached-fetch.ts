const cache = new Map<string, { data: any; expiry: number }>();
const DEFAULT_TTL = 5 * 60 * 1000;

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.data as T;
  if (entry) cache.delete(key);
  return null;
}

export function setCache(key: string, data: any, ttlMs = DEFAULT_TTL): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}

export function fetchCached(url: string, ttlMs = DEFAULT_TTL): Promise<any> {
  const cached = getCached(url);
  if (cached) return Promise.resolve(cached);
  return fetch(url).then(r => r.ok ? r.json() : Promise.reject("Fetch failed")).then(data => {
    setCache(url, data, ttlMs);
    return data;
  });
}
