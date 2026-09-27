import type { RoofType } from '../../types/weather.js';

export interface Stadium {
  lat: number;
  lon: number;
  roof: RoofType;
}

/**
 * Every home stadium, keyed by normalized team code (the vocabulary `normalizeTeamCode` produces).
 * Shared stadiums (MetLife, SoFi) simply appear twice. Neutral-site games aren't here — they
 * fall back to ESPN's own conditions.
 *
 * Update this when a team moves house; nothing else knows where a game is played.
 */
export const STADIUMS: Record<string, Stadium> = {
  ARI: { lat: 33.5276, lon: -112.2626, roof: 'retractable' },
  ATL: { lat: 33.7554, lon: -84.4008, roof: 'retractable' },
  BAL: { lat: 39.278, lon: -76.6227, roof: 'open' },
  BUF: { lat: 42.7738, lon: -78.787, roof: 'open' },
  CAR: { lat: 35.2258, lon: -80.8528, roof: 'open' },
  CHI: { lat: 41.8623, lon: -87.6167, roof: 'open' },
  CIN: { lat: 39.0955, lon: -84.5161, roof: 'open' },
  CLE: { lat: 41.5061, lon: -81.6995, roof: 'open' },
  DAL: { lat: 32.7473, lon: -97.0945, roof: 'retractable' },
  DEN: { lat: 39.7439, lon: -105.0201, roof: 'open' },
  DET: { lat: 42.34, lon: -83.0456, roof: 'dome' },
  GB: { lat: 44.5013, lon: -88.0622, roof: 'open' },
  HOU: { lat: 29.6847, lon: -95.4107, roof: 'retractable' },
  IND: { lat: 39.7601, lon: -86.1639, roof: 'retractable' },
  JAX: { lat: 30.3239, lon: -81.6373, roof: 'open' },
  KC: { lat: 39.0489, lon: -94.4839, roof: 'open' },
  LAC: { lat: 33.9535, lon: -118.3392, roof: 'dome' },
  LAR: { lat: 33.9535, lon: -118.3392, roof: 'dome' },
  LV: { lat: 36.0909, lon: -115.1833, roof: 'dome' },
  MIA: { lat: 25.958, lon: -80.2389, roof: 'open' },
  MIN: { lat: 44.9737, lon: -93.2577, roof: 'dome' },
  NE: { lat: 42.0909, lon: -71.2643, roof: 'open' },
  NO: { lat: 29.9511, lon: -90.0812, roof: 'dome' },
  NYG: { lat: 40.8135, lon: -74.0745, roof: 'open' },
  NYJ: { lat: 40.8135, lon: -74.0745, roof: 'open' },
  PHI: { lat: 39.9008, lon: -75.1675, roof: 'open' },
  PIT: { lat: 40.4468, lon: -80.0158, roof: 'open' },
  SEA: { lat: 47.5952, lon: -122.3316, roof: 'open' },
  SF: { lat: 37.403, lon: -121.97, roof: 'open' },
  TB: { lat: 27.9759, lon: -82.5033, roof: 'open' },
  TEN: { lat: 36.1665, lon: -86.7713, roof: 'open' },
  WAS: { lat: 38.9078, lon: -76.8645, roof: 'open' },
};
