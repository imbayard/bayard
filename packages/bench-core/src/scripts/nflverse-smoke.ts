import { LruCache } from '../cache/lru-cache.js';
import { NflverseClient, getOLineAggregates } from '../adapters/nflverse/index.js';
import { oLineRatings } from '../compute/insights/o-line-rating.js';

/**
 * Live smoke test for the nflverse O-Line pipeline: fetch → gunzip → parse →
 * aggregate → league-normalized ratings. Proves the assumed PBP column names
 * (posteam, sack, qb_dropback, rush_attempt, epa, ...) match real data.
 *
 * Usage: pnpm --filter @benchpoints/core nflverse-smoke [season]
 */
async function main(): Promise<void> {
  const season = Number(process.argv[2] ?? 2024);
  const client = new NflverseClient(new LruCache());

  console.log(`Fetching nflverse play-by-play for ${season}...`);
  const t0 = Date.now();
  const aggregates = await getOLineAggregates(client, season);
  console.log(`Parsed + aggregated in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`Teams with data: ${aggregates.length}`);

  // Sanity: expect 32 teams, non-zero dropbacks/rushAttempts across the board.
  const zeroDrop = aggregates.filter((a) => a.dropbacks === 0).map((a) => a.team);
  const zeroRush = aggregates.filter((a) => a.rushAttempts === 0).map((a) => a.team);
  if (aggregates.length !== 32) {
    console.warn(`⚠  Expected 32 teams, got ${aggregates.length} — column mapping may be off.`);
  }
  if (zeroDrop.length) console.warn(`⚠  Teams with 0 dropbacks: ${zeroDrop.join(', ')}`);
  if (zeroRush.length) console.warn(`⚠  Teams with 0 rush attempts: ${zeroRush.join(', ')}`);

  const totalSacks = aggregates.reduce((s, a) => s + a.sacks, 0);
  const totalDropbacks = aggregates.reduce((s, a) => s + a.dropbacks, 0);
  const totalRush = aggregates.reduce((s, a) => s + a.rushAttempts, 0);
  console.log(
    `League totals — dropbacks: ${totalDropbacks}, sacks: ${totalSacks} ` +
      `(${((100 * totalSacks) / totalDropbacks).toFixed(1)}% sack rate), rush att: ${totalRush}`,
  );

  const ratings = oLineRatings(aggregates);
  const byPass = [...ratings].sort((a, b) => a.passRank - b.passRank);

  console.log('\nTeam  Pass(rank)  Run(rank)');
  for (const r of byPass) {
    console.log(
      `${r.team.padEnd(4)}  ${String(r.passBlock).padStart(5)} (${String(r.passRank).padStart(2)})  ` +
        `${String(r.runBlock).padStart(5)} (${String(r.runRank).padStart(2)})`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
