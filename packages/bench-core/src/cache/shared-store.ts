/**
 * A cache that outlives one process — on Netlify, every concurrent request can land on its
 * own cold instance, and the in-process LRU starts empty on each. Async because it sits
 * behind the network. Only the big, slow-moving payloads (the 24h player pools) go here.
 */
export interface SharedStore {
  /** Undefined on a miss or once `expiresAt` (epoch ms) has passed. */
  get<T>(key: string): Promise<{ data: T; expiresAt: number } | undefined>;
  set<T>(key: string, data: T, ttlMs: number): Promise<void>;
}

/**
 * Memory -> shared store -> network, for one key. The shared store is an optimisation, never
 * a dependency: if it throws on read or write we log and carry on as if it weren't there.
 * A shared hit goes into memory for whatever TTL it has left, so freshness matches a
 * straight network fetch.
 */
export async function readThroughShared<T>(
  store: SharedStore | undefined,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<{ data: T; ttlMs: number }> {
  if (store) {
    try {
      const hit = await store.get<T>(key);
      if (hit) return { data: hit.data, ttlMs: hit.expiresAt - Date.now() };
    } catch (err) {
      console.warn(`shared store read failed for ${key}:`, err);
    }
  }

  const data = await load();
  if (store) {
    try {
      await store.set(key, data, ttlMs);
    } catch (err) {
      console.warn(`shared store write failed for ${key}:`, err);
    }
  }
  return { data, ttlMs };
}
