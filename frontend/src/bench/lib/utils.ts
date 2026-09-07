import type { DraftStatus } from '@benchpoints/core';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRecord(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
}

export function formatDraftDate(iso: string | null): string {
  if (!iso) return 'Draft: TBD';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Draft: TBD';

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `Draft: ${month}/${day}`;
}

export type DraftSlot = { kind: 'live' | 'projection' | 'date'; label: string };

/**
 * What the draft badge on a league card says. A running draft outranks everything. Once the
 * draft has run and there are players on the roster, the draft date is stale trivia — this
 * week's projection is the number worth the slot.
 */
export function draftSlot(
  draftDate: string | null,
  draftStatus: DraftStatus | null,
  rosterCount: number,
  projectedPoints: number | null,
): DraftSlot {
  if (draftStatus === 'drafting' || draftStatus === 'paused') {
    return { kind: 'live', label: 'Draft In Progress' };
  }
  const hasDrafted =
    draftStatus === 'complete' ||
    (draftDate !== null && new Date(draftDate).getTime() < Date.now());
  if (hasDrafted && rosterCount > 0 && projectedPoints !== null) {
    return { kind: 'projection', label: `Proj ${projectedPoints.toFixed(1)}` };
  }
  return { kind: 'date', label: formatDraftDate(draftDate) };
}
