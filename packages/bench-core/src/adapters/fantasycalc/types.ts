/** One row of `GET /values/current`, trimmed to what we read. */
export interface FantasyCalcValueRow {
  player: {
    name: string;
    position: string;
    sleeperId?: string | null;
    espnId?: string | null;
    maybeAge?: number | null;
  };
  value: number;
  redraftValue: number;
  trend30Day: number;
  maybeTier?: number | null;
}

export type FantasyCalcValuesResponse = FantasyCalcValueRow[];
