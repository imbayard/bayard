/**
 * Collapses concurrent loads of the same key into one. The cache only helps once a load has
 * finished; on a cold cache, every caller that arrives before then would start its own
 * download (the Sleeper player DB is ~5MB). Failures aren't remembered: the entry goes as
 * soon as the load settles, so the next caller retries.
 */
export class InFlight {
  private readonly pending = new Map<string, Promise<unknown>>();

  run<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key);
    if (existing) return existing as Promise<T>;

    const request = load().finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}
