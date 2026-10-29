/** `GET /analytics/players/batch`, as the Coach backend sends it. */
export interface AnalyticsBatchResponse {
  season: number | null;
  week: number | null;
  as_of: string | null;
  players: Record<
    string,
    {
      pid: number;
      name: string;
      position: string | null;
      pos_group: string | null;
      metrics: Record<string, Record<string, { value: number; shrunk: number | null; n: number; pct: number | null }>>;
    }
  >;
}

/** `GET /analytics/metrics`: the registry with each metric's calibration. */
export interface AnalyticsMetricsResponse {
  metrics: Record<string, { key: string; yoy_r: number | null; shrink_k: number | null }>;
}
