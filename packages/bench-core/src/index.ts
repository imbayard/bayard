export type {
  Draft,
  DraftBoard,
  DraftPick,
  DraftStatus,
  DraftType,
  League,
  Matchup,
  NflGameState,
  NflWeekOpponent,
  Platform,
  Player,
  Roster,
  RosterEntry,
  Team,
} from './types/league.js';
export type { PlatformAdapter } from './types/platform.js';
export type { Cache } from './cache/cache.js';
export { LruCache } from './cache/lru-cache.js';
export { SleeperClient, SleeperApiError } from './adapters/sleeper/client.js';
export { SleeperAdapter } from './adapters/sleeper/adapter.js';
export * from './adapters/sleeper/mapper.js';
export type * from './adapters/sleeper/types.js';
export { EspnClient, EspnApiError } from './adapters/espn/client.js';
export { EspnAdapter } from './adapters/espn/adapter.js';
export type * from './adapters/espn/types.js';
export * from './adapters/nfl-schedule/index.js';
export * from './adapters/weather/index.js';
export * from './adapters/analytics/index.js';
export type { MetricWindow, MetricWindows, PlayerCard, PlayerCards } from './types/analytics.js';
export type {
  GameConditions,
  GameWeather,
  NflGameVenue,
  RoofType,
  WeatherKind,
  WeatherNote,
  WeatherSeverity,
} from './types/weather.js';
export { WEATHER_RULES, assessConditions, weatherExposure, weatherSummary } from './compute/weather.js';
export type { WeatherExposure } from './compute/weather.js';
export { normalizeTeamCode } from './adapters/nflverse/team-codes.js';
export { NflverseApiError, NflverseClient } from './adapters/nflverse/client.js';
export { aggregateGiveaway, blendGiveaway, parseTeamWeekCsv } from './adapters/nflverse/team-stats.js';
export type { GiveawayOptions } from './adapters/nflverse/team-stats.js';
export type {
  OffenseGiveawayRating,
  OLineRating,
  TeamGiveawayAggregate,
  TeamOLineAggregate,
} from './types/nflverse.js';
export { offenseGiveawayRatings, priorSeasonWeight } from './compute/scout/offense-giveaway.js';
export { scoutFrame } from './compute/scout/scout-frame.js';
export type { ScoutCandidate, ScoutFrameInput, ScoutWeekCell } from './compute/scout/scout-frame.js';
export type { BenchIqFlag } from './compute/types.js';
export { computeRosterNeeds } from './compute/roster-needs.js';
export type { PositionNeed, RosterNeeds } from './compute/roster-needs.js';
export * from './compute/flags/index.js';
export {
  buildDigest,
  buildFlagsDigestSection,
  buildInjurySection,
  buildProjectionsSection,
  buildRecordSection,
  buildWaiverSection,
  buildWeatherSection,
  renderDigestEmail,
} from './compute/digest.js';
export type { DigestKind, DigestSection, LeagueDigestEntry } from './compute/digest.js';
export { INACTIVE_STATUSES, REPORTABLE_INJURY_STATUSES, injuryReport } from './compute/injury.js';
export type { InjuryEntry } from './compute/injury.js';
export { formatRecord, matchupResult, tallyResults } from './compute/results.js';
export { buildRootingBoard, rootingKey } from './compute/rooting.js';
export type { RootingRow, RootingSide, RootingStake, RootingStarter } from './compute/rooting.js';
export type { MatchupResult, WinLossRecord } from './compute/results.js';
export * from './mocks/index.js';
