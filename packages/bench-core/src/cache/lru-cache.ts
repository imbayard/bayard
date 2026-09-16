import { LRUCache } from 'lru-cache';
import type { Cache } from './cache.js';

/**
 * In-process LRU cache. Single API instance only — swap for Redis behind the
 * same Cache interface when we run more than one instance.
 */
export class LruCache implements Cache {
  private readonly store: LRUCache<string, object>;

  constructor(max = 5000) {
    this.store = new LRUCache({ max });
  }

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, value as unknown as object, { ttl: ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deleteWhere(predicate: (key: string) => boolean): number {
    // Materialise the key list first — deleting while walking the live iterator is unsafe.
    const doomed = [...this.store.keys()].filter(predicate);
    for (const key of doomed) this.store.delete(key);
    return doomed.length;
  }
}
