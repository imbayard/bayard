import type { TeamOLineAggregate } from '../../types/nflverse.js';
import type { BenchIqInsight } from '../types.js';
import { oLineInsights } from './o-line-rating.js';

export { oLineInsights, oLineRatings } from './o-line-rating.js';

export function computeBenchIqInsights(aggregates: TeamOLineAggregate[]): BenchIqInsight[] {
  return [
    ...oLineInsights(aggregates),
    // more insight producers slot in here later
  ];
}
