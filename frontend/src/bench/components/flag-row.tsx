import type { BenchIqFlag } from '@benchpoints/core';

/**
 * The candidate → starter swap, which is the whole content of a projection flag. The prose
 * message stays on the row's title, so nothing is lost and nothing is repeated down the list.
 */
export function SwapLine({ flag }: { flag: BenchIqFlag }) {
  if (flag.delta === null || !flag.playerName || !flag.starterName) return <>{flag.message}</>;
  return (
    <>
      <span className="text-foreground">{flag.playerName}</span>
      {flag.type === 'WAIVER_PLAYER_HIGHER_PROJECTION' && ' (waivers)'}
      <span className="px-1.5 opacity-50">→</span>
      {flag.starterName}
    </>
  );
}

/** One number per row, in a fixed right-hand column so the deltas scan as a column. */
export function DeltaCell({ value }: { value: number }) {
  return (
    <span className="scoreboard w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
      {value > 0 && <span className="font-normal text-muted-foreground">+</span>}
      {value.toFixed(1)}
    </span>
  );
}
