import type { TeamOLineAggregate } from '../../types/nflverse.js';
import type { NflverseClient } from './client.js';

export { NflverseApiError, NflverseClient } from './client.js';
export { aggregateOLine, parsePbpCsv } from './mapper.js';
export { normalizeTeamCode } from './team-codes.js';
export type { RawPbpRow } from './types.js';

/**
 * Convenience wrapper: fetch → gunzip → parse → aggregate for one season,
 * with the aggregate cached (see {@link NflverseClient.getOLineAggregates}).
 */
export function getOLineAggregates(
  client: NflverseClient,
  season: number,
): Promise<TeamOLineAggregate[]> {
  return client.getOLineAggregates(season);
}
