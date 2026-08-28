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
