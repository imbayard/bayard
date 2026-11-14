import type { SharedStore } from '@benchpoints/core';
import { getStore } from '@netlify/blobs';

/**
 * Netlify Blobs behind the core's SharedStore, so every Function instance sees the same
 * player pools. Blobs have no TTL of their own: each entry carries its `expiresAt`, and
 * anything past it reads as a miss — freshness stays exactly what the clients' TTLs say.
 *
 * The store is opened per call: Netlify hands the Blobs context to the function at
 * invocation time. Outside Netlify (the local dev server) there is no context, so every
 * call is a quiet miss and the clients go to the network as they always did.
 */
export const blobStore: SharedStore = {
  async get<T>(key: string) {
    const store = open();
    if (!store) return undefined;
    const entry = (await store.get(encodeURIComponent(key), { type: 'json' })) as
      | { data: T; expiresAt: number }
      | null;
    return entry && entry.expiresAt > Date.now() ? entry : undefined;
  },

  async set<T>(key: string, data: T, ttlMs: number) {
    const store = open();
    if (!store) return;
    await store.setJSON(encodeURIComponent(key), { data, expiresAt: Date.now() + ttlMs });
  },
};

function open(): ReturnType<typeof getStore> | undefined {
  try {
    return getStore('bench-shared-cache');
  } catch (err) {
    if (err instanceof Error && err.name === 'MissingBlobsEnvironmentError') return undefined;
    throw err;
  }
}
