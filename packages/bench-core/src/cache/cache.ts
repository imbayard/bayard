export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
  delete(key: string): void;
  /**
   * Drop every entry whose key matches, ignoring TTL. Returns how many went.
   * This is what a manual refresh runs on — the TTLs encode "how long is this
   * good for by default", not "how long must the user wait".
   */
  deleteWhere(predicate: (key: string) => boolean): number;
}
