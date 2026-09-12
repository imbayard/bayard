import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mapGameStates, mapWeekOpponents } from './mapper.js';
import type { EspnScoreboardResponse } from './types.js';

const scoreboard = JSON.parse(
  readFileSync(fileURLToPath(new URL('./__fixtures__/scoreboard.json', import.meta.url)), 'utf8'),
) as EspnScoreboardResponse;

describe('mapGameStates', () => {
  it('keys both competitors of every game by team code', () => {
    const states = mapGameStates(scoreboard);
    expect([...states.keys()].sort()).toEqual(['CIN', 'CLE', 'DAL', 'NYG', 'PHI', 'WAS']);
    expect(states.get('DAL')).toEqual({
      team: 'DAL',
      kickoff: '2025-09-05T00:20:00.000Z',
      state: 'post',
    });
    expect(states.get('CLE')?.state).toBe('in');
    expect(states.get('NYG')?.state).toBe('pre');
  });

  it('normalizes ESPN abbreviations to the Sleeper vocabulary', () => {
    // ESPN's scoreboard writes Washington as WSH; rosters key on WAS.
    expect(mapGameStates(scoreboard).get('WAS')?.team).toBe('WAS');
  });

  it('skips events with an unrecognized state', () => {
    const raw: EspnScoreboardResponse = {
      events: [{ ...scoreboard.events[0]!, status: { type: { state: 'postponed' } } }],
    };
    expect(mapGameStates(raw).size).toBe(0);
  });
});

describe('mapWeekOpponents', () => {
  it('pairs both sides of every game, keyed by team code', () => {
    const opponents = mapWeekOpponents(scoreboard);
    expect(opponents.get('DAL')).toEqual({
      team: 'DAL',
      opponent: 'PHI',
      home: false,
      kickoff: '2025-09-05T00:20:00.000Z',
    });
    expect(opponents.get('PHI')).toMatchObject({ opponent: 'DAL', home: true });
  });

  it('keeps finished games — the opponent is the opponent either way', () => {
    const opponents = mapWeekOpponents(scoreboard);
    expect([...opponents.keys()].sort()).toEqual(['CIN', 'CLE', 'DAL', 'NYG', 'PHI', 'WAS']);
  });

  it('normalizes both sides to the Sleeper vocabulary', () => {
    expect(mapWeekOpponents(scoreboard).get('WAS')?.team).toBe('WAS');
  });

  it('reports an unknown home side rather than guessing from competitor order', () => {
    const event = scoreboard.events[0] as (typeof scoreboard.events)[number];
    const raw: EspnScoreboardResponse = {
      events: [
        {
          ...event,
          competitions: [
            {
              competitors: event.competitions[0]!.competitors.map((c) => ({ team: c.team })),
            },
          ],
        },
      ],
    };
    expect(mapWeekOpponents(raw).get('DAL')?.home).toBeNull();
  });

  it('skips a competition that does not have exactly two sides', () => {
    const event = scoreboard.events[0] as (typeof scoreboard.events)[number];
    const raw: EspnScoreboardResponse = {
      events: [{ ...event, competitions: [{ competitors: [] }] }],
    };
    expect(mapWeekOpponents(raw).size).toBe(0);
  });
});
