import { afterEach, describe, expect, it, vi } from 'vitest';
import { LruCache } from '../../cache/lru-cache.js';
import type { SharedStore } from '../../cache/shared-store.js';
import { SleeperClient } from './client.js';

const PLAYERS = { '4046': { player_id: '4046', full_name: 'Patrick Mahomes' } };

function stubFetch(...responses: (() => Response)[]) {
  const fetchMock = vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const ok = () => new Response(JSON.stringify(PLAYERS), { status: 200 });
const fail = () => new Response('boom', { status: 500 });

/** In-memory SharedStore that records writes. */
class MemoryStore implements SharedStore {
  entries = new Map<string, { data: unknown; expiresAt: number }>();
  failReads = false;

  async get<T>(key: string) {
    if (this.failReads) throw new Error('store down');
    const hit = this.entries.get(key);
    return hit && hit.expiresAt > Date.now() ? (hit as { data: T; expiresAt: number }) : undefined;
  }

  async set<T>(key: string, data: T, ttlMs: number) {
    this.entries.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SleeperClient', () => {
  it('shares one request between concurrent callers on a cold cache', async () => {
    const fetchMock = stubFetch(ok);
    const client = new SleeperClient(new LruCache());

    const [a, b] = await Promise.all([client.getPlayers(), client.getPlayers()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(PLAYERS);
    expect(b).toBe(a);
  });

  it('does not cache a failed fetch — the next call retries', async () => {
    const fetchMock = stubFetch(fail, ok);
    const client = new SleeperClient(new LruCache());

    await expect(client.getPlayers()).rejects.toThrow('Sleeper API 500');
    await expect(client.getPlayers()).resolves.toEqual(PLAYERS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads the player DB from the shared store before the network', async () => {
    const fetchMock = stubFetch();
    const store = new MemoryStore();
    await store.set('sleeper:/players/nfl', PLAYERS, 60_000);
    const client = new SleeperClient(new LruCache(), undefined, store);

    await expect(client.getPlayers()).resolves.toEqual(PLAYERS);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('writes a network hit through to the shared store', async () => {
    stubFetch(ok);
    const store = new MemoryStore();
    const client = new SleeperClient(new LruCache(), undefined, store);

    await client.getPlayers();
    expect(store.entries.get('sleeper:/players/nfl')?.data).toEqual(PLAYERS);
  });

  it('falls through to the network when the shared store throws', async () => {
    const fetchMock = stubFetch(ok);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new MemoryStore();
    store.failReads = true;
    const client = new SleeperClient(new LruCache(), undefined, store);

    await expect(client.getPlayers()).resolves.toEqual(PLAYERS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps volatile endpoints out of the shared store', async () => {
    stubFetch(() => new Response(JSON.stringify([]), { status: 200 }));
    const store = new MemoryStore();
    const client = new SleeperClient(new LruCache(), undefined, store);

    await client.getMatchups('123', 1);
    expect(store.entries.size).toBe(0);
  });
});
