import { API_BASE } from '../../lib/config'

/**
 * Types mirror the backend's generic chart payload (`backend/health/graph.py`).
 * Nothing here is WHOOP-specific on purpose: a series names the point field it
 * reads, so the same component renders any chart the backend describes.
 */

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** Semantic slot a series paints with; the frontend owns the actual colour. */
export type Accent = 'good' | 'info'

export interface Band {
  label: string
  min: number
  max: number
  tone: Tone
}

export interface Series {
  key: string
  label: string
  render: 'bar' | 'line'
  unit?: string
  value_min?: number
  value_max?: number
  /** Multiply back by this to label a secondary axis in the series' own units. */
  scale_to_value?: number
  bands?: Band[]
  derived_from?: string
  accent?: Accent
}

/** Series values are indexed by `Series.key`, alongside the fixed fields. */
export interface Point {
  x: number
  x_label: string
  band: Tone | null
  partial: boolean
  [seriesKey: string]: number | string | boolean | null
}

export interface SummaryTile {
  label: string
  value: string
  delta?: string | null
  tone?: Tone
}

export interface ChartPayload {
  chart: {
    type: string
    title: string
    x_label: string
    value_label: string
    value_min: number
    value_max: number
    bucket: 'day' | 'week' | 'month'
  }
  series: Series[]
  points: Point[]
  summary: SummaryTile[]
}

export const TIMEFRAMES = ['7d', '1m', '3m', '6m', '1y', 'all'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '7d': '1W',
  '1m': '1M',
  '3m': '3M',
  '6m': '6M',
  '1y': '1Y',
  all: 'ALL',
}

export interface Coverage {
  days: number
  first: string | null
  last: string | null
  /** UTC ISO timestamp of the newest row's last sync, or null when empty. */
  synced_at: string | null
}

/** Re-pull if the mirror is empty or was last touched over half an hour ago —
 *  today's strain climbs all day, so it is never done changing.
 *
 *  Deliberately not "does `last` reach today": `last` is a local calendar date
 *  while the obvious comparison date is UTC, so for the hours either side of
 *  midnight they disagree and every page load would trigger a sync. The newest
 *  cycle also legitimately lags — it starts at sleep onset — so a missing today
 *  is normal rather than evidence of staleness. */
export const STALE_AFTER_MS = 30 * 60 * 1000

export function isStale(coverage: Coverage): boolean {
  if (!coverage.days || !coverage.synced_at) return true
  // SQLite stores a naive UTC timestamp; mark it as UTC before comparing.
  const syncedAt = Date.parse(`${coverage.synced_at}Z`)
  return Number.isNaN(syncedAt) || Date.now() - syncedAt > STALE_AFTER_MS
}

export function sinceLabel(iso: string | null): string {
  if (!iso) return 'never synced'
  const ms = Date.now() - Date.parse(`${iso}Z`)
  if (Number.isNaN(ms)) return 'never synced'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'synced just now'
  if (minutes < 60) return `synced ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `synced ${hours}h ago`
  return `synced ${Math.floor(hours / 24)}d ago`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.detail ?? `${response.status} ${response.statusText}`)
  }
  return response.json()
}

export function fetchGraph(timeframe: Timeframe, signal?: AbortSignal) {
  return request<ChartPayload>(`/health/graph?timeframe=${timeframe}`, { signal })
}

export function fetchCoverage(signal?: AbortSignal) {
  return request<Coverage>('/health/coverage', { signal })
}

/** Pull WHOOP into the local mirror. `full` walks all history (~15s). */
export function syncWhoop(full = false) {
  return request<{ synced: number; since: string }>(
    `/health/sync${full ? '?full=true' : ''}`,
    { method: 'POST' },
  )
}

export function whoopStatus(signal?: AbortSignal) {
  return request<{ configured: boolean; authenticated: boolean }>(
    '/integrations/whoop/oauth/status',
    { signal },
  )
}
