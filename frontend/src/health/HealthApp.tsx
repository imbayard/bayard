import { useEffect, useState } from 'react'
import { labelStyle, ghostBtnStyle } from '../lib/styles'
import {
  fetchGraph,
  TIMEFRAMES,
  TIMEFRAME_LABELS,
  type ChartPayload,
  type Timeframe,
  type Tone,
} from './lib/api'

const TONE_COLOR: Record<Tone, string> = {
  good: '#15803d',
  warn: '#a16207',
  bad: '#b91c1c',
  neutral: '#111827',
}

export default function HealthApp({ onExitToHome }: { onExitToHome: () => void }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('7d')
  const [payload, setPayload] = useState<ChartPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchGraph(timeframe, controller.signal)
      .then(setPayload)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [timeframe])

  return (
    <div style={s.container}>
      <header style={s.header}>
        <button onClick={onExitToHome} style={{ ...ghostBtnStyle, color: '#9ca3af' }}>
          ← Home
        </button>
        <span style={s.headerTitle}>Am I Healthy</span>
      </header>

      <div style={s.body}>
        <div style={s.summaryRow}>
          {(payload?.summary ?? []).map((tile) => (
            <div key={tile.label} style={s.tile}>
              <span style={s.tileLabel}>{tile.label}</span>
              <span style={{ ...s.tileValue, color: TONE_COLOR[tile.tone ?? 'neutral'] }}>
                {tile.value}
              </span>
              {tile.delta && <span style={s.tileDelta}>{tile.delta}</span>}
            </div>
          ))}
        </div>

        <div style={s.chartSlot}>
          {loading && <span style={s.note}>Loading…</span>}
          {error && <span style={{ ...s.note, color: '#b91c1c' }}>{error}</span>}
          {!loading && !error && payload && (
            // Chart component lands here — the payload is already plot-ready.
            <span style={s.note}>
              {payload.points.length} {payload.chart.bucket} points ·{' '}
              {payload.series.map((x) => x.label).join(' · ')}
            </span>
          )}
        </div>

        <div style={s.timeframeRow}>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={tf === timeframe ? { ...s.timeframe, ...s.timeframeOn } : s.timeframe}
            >
              {TIMEFRAME_LABELS[tf]}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: 720,
    margin: '0 auto',
    fontFamily: 'system-ui, sans-serif',
    border: '1px solid #111827',
    boxSizing: 'border-box',
  },
  header: {
    padding: '10px 20px',
    background: '#111827',
    borderBottom: '2px solid #111827',
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: 800,
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: 1,
    background: '#111827',
    border: '1px solid #111827',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '12px 14px',
    background: '#fff',
  },
  tileLabel: {
    ...labelStyle,
    color: '#9ca3af',
  },
  tileValue: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  tileDelta: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
  },
  chartSlot: {
    minHeight: 260,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid #111827',
    background: '#fff',
  },
  note: {
    ...labelStyle,
    color: '#9ca3af',
  },
  timeframeRow: {
    display: 'flex',
    gap: 1,
    background: '#111827',
    border: '1px solid #111827',
  },
  timeframe: {
    flex: 1,
    padding: '10px 0',
    background: '#fff',
    border: 'none',
    borderRadius: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.14em',
    color: '#6b7280',
  },
  timeframeOn: {
    background: '#111827',
    color: '#fff',
  },
}
