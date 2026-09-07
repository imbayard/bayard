import type { DraftStatus } from '@benchpoints/core';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDraftDate(iso: string | null): string {
  if (!iso) return 'Draft: TBD';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Draft: TBD';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `Draft: ${month}/${day}`;
}

export type DraftSlot = {
  kind: 'live' | 'flags' | 'date';
  label: string;
  /** How loudly the chip should read: red, amber, blue, or quiet outline. */
  tone: 'alert' | 'notice' | 'info' | 'quiet';
};

/**
 * What the single status chip on a league card says. A running draft outranks everything —
 * it's the one state you'd drop what you're doing for. Before the draft, the date is the only
 * fact worth the slot. Once the draft has run and there's a roster to be wrong about, the date
 * is stale trivia and the chip becomes the lineup's alarm count: the number that actually moves
 * week to week. Three or more open flags is a bad week (red), one or two is a nudge (amber),
 * and a clean lineup has earned the right not to shout. The draft date is blue throughout —
 * a date on a calendar is information, not a warning, and only the flag counts get to alarm.
 */
export function draftSlot(
  draftDate: string | null,
  draftStatus: DraftStatus | null,
  rosterCount: number,
  visibleFlagCount: number,
): DraftSlot {
  if (draftStatus === 'drafting' || draftStatus === 'paused') {
    return { kind: 'live', label: 'Draft In Progress', tone: 'alert' };
  }
  const hasDrafted =
    draftStatus === 'complete' ||
    (draftDate !== null && new Date(draftDate).getTime() < Date.now());
  // An empty roster past the draft date means we don't really know the draft happened —
  // fall back to the date rather than claiming a clean lineup.
  if (hasDrafted && rosterCount > 0) {
    return {
      kind: 'flags',
      label: `${visibleFlagCount} ${visibleFlagCount === 1 ? 'flag' : 'flags'}`,
      tone: visibleFlagCount >= 3 ? 'alert' : visibleFlagCount > 0 ? 'notice' : 'quiet',
    };
  }
  return { kind: 'date', label: formatDraftDate(draftDate), tone: 'info' };
}
