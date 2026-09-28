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
      metrics: Record<string, Record<string, { value: number; n: number; pct: number | null }>>;
    }
  >;
}
