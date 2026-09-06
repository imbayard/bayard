import { Component, useCallback, useEffect, useState, type ReactNode } from 'react'
import { labelStyle, ghostBtnStyle } from '../lib/styles'
import StrainRecoveryChart, {
  TONE_COLOR,
  ACCENT,
  RECOVERY_FILL,
  STRAIN_FILL,
  RECOVERY_FILL_OPACITY,
  STRAIN_FILL_OPACITY,
} from './StrainRecoveryChart'
import {
  fetchCoverage,
  fetchGraph,
  isStale,
  sinceLabel,
  syncWhoop,
  TIMEFRAMES,
  TIMEFRAME_LABELS,
  type ChartPayload,
  type Coverage,
  type Timeframe,
} from './lib/api'

export default function HealthApp({ onExitToHome }: { onExitToHome: () => void }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('7d')
  const [payload, setPayload] = useState<ChartPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // The amber band sits below 3:1 against white, so a table view is required
  // relief rather than a nicety — it is also the fastest way to read exact days.
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [coverage, setCoverage] = useState<Coverage | null>(null)
  const [syncing, setSyncing] = useState(false)
  // Bumped after a sync to re-run the graph fetch against the fresh mirror.
  const [synced, setSynced] = useState(0)

  const runSync = useCallback(async (full = false) => {
    setSyncing(true)
    try {
      await syncWhoop(full)
      setCoverage(await fetchCoverage())
      setSynced((n) => n + 1)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }, [])

  // Connecting WHOOP stores a token but pulls nothing, and a deploy resets the
  // mirror, so the page tops itself up rather than depending on someone
  // remembering to POST /health/sync. Incremental is ~2 requests.
  useEffect(() => {
    let cancelled = false
    fetchCoverage()
      .then((current) => {
        if (cancelled) return
        setCoverage(current)
        if (isStale(current)) void runSync(current.days === 0)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [runSync])

  useEffect(() => {
    // Ignore a superseded response rather than aborting the request. Under
    // StrictMode the effect runs twice on mount, and cancelling the first fetch
    // surfaces as NS_BINDING_ABORTED in the network panel — a dev-only artifact
    // that reads like a real failure. Payloads are small enough to let land.
    let stale = false
    setLoading(true)
    setError(null)
    fetchGraph(timeframe)
      .then((data) => {
        if (!stale) setPayload(data)
      })
      .catch((e) => {
        if (!stale) setError(e.message)
      })
      .finally(() => {
        if (!stale) setLoading(false)
      })
    return () => {
      stale = true
    }
  }, [timeframe, synced])

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
              <span style={s.tileValueRow}>
                {tile.tone && tile.tone !== 'neutral' && (
                  <span style={{ ...s.tileDot, background: TONE_COLOR[tile.tone] }} />
                )}
                <span style={s.tileValue}>{tile.value}</span>
              </span>
              {tile.delta && <span style={s.tileDelta}>{tile.delta}</span>}
            </div>
          ))}
        </div>

        <div style={s.chartSlot}>
          <div style={s.chartHead}>
            <span style={s.chartTitle}>{payload?.chart.title ?? 'Strain & Recovery'}</span>
            <div style={s.chartHeadRight}>
              {payload && (
                <span style={s.chartMeta}>
                  {payload.points.length} {payload.chart.bucket}
                </span>
              )}
              <button style={s.viewToggle} onClick={() => setView(view === 'chart' ? 'table' : 'chart')}>
                {view === 'chart' ? 'Table' : 'Chart'}
              </button>
              <button
                style={{ ...s.viewToggle, opacity: syncing ? 0.5 : 1 }}
                onClick={() => void runSync()}
                disabled={syncing}
                title={coverage ? sinceLabel(coverage.synced_at) : undefined}
              >
                {syncing ? 'Syncing…' : 'Sync'}
              </button>
            </div>
          </div>
          <div style={view === 'chart' ? s.chartBody : s.tableBody}>
            {loading && <span style={s.note}>Loading…</span>}
            {error && <span style={{ ...s.note, color: '#9f1239' }}>{error}</span>}
            {!loading && !error && payload && view === 'chart' && (
              <ChartBoundary>
                <StrainRecoveryChart payload={payload} />
              </ChartBoundary>
            )}
            {!loading && !error && payload && view === 'table' && (
              <DataTable payload={payload} />
            )}
          </div>
        </div>

        {payload && (
          <div style={s.legend}>
            {payload.series.map((series) => (
              <span key={series.key} style={s.legendItem}>
                <span style={swatchFor(series)} />
                {series.label}
              </span>
            ))}
            <span style={s.legendBands}>
              {payload.series
                .find((x) => x.bands)
                ?.bands?.map((band) => (
                  <span key={band.label} style={s.legendItem}>
                    {/* Bands ride as an outline on the bar, so the key shows an
                        outline too rather than a solid chip. */}
                    <span
                      style={{
                        ...s.legendSwatch,
                        background: RECOVERY_FILL,
                        opacity: RECOVERY_FILL_OPACITY + 0.25,
                        border: `1.5px solid ${TONE_COLOR[band.tone]}`,
                      }}
                    />
                    {band.label} {band.min}–{band.max}
                  </span>
                ))}
            </span>
          </div>
        )}

        {coverage && (
          <span style={s.syncNote}>
            {syncing ? 'Syncing with WHOOP…' : sinceLabel(coverage.synced_at)}
            {coverage.days > 0 && ` · ${coverage.days} days mirrored`}
          </span>
        )}

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

/** Legend chips are built from the chart's own tokens so the two cannot drift:
 *  a bar shows its fill at its real opacity, a line shows its accent stroke. */
function swatchFor(series: ChartPayload['series'][number]): React.CSSProperties {
  if (series.render === 'line') {
    return { ...s.legendLine, background: ACCENT[series.accent ?? 'good'].base }
  }
  if (series.bands) {
    return {
      ...s.legendSwatch,
      background: RECOVERY_FILL,
      opacity: RECOVERY_FILL_OPACITY + 0.25,
      border: '1.5px solid #9ca3af',
    }
  }
  // Strain nests inside the recovery bar, so its chip shows a centred column
  // rather than a solid block.
  return {
    ...s.legendSwatch,
    background: `linear-gradient(90deg, transparent 27%, ${STRAIN_FILL} 27% 73%, transparent 73%)`,
    opacity: STRAIN_FILL_OPACITY + 0.35,
  }
}

/** A throw inside the chart would otherwise unmount the whole app and leave a
 *  blank page, which is a miserable way to find out something broke. */
class ChartBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: Error) {
    return { message: error.message }
  }

  render() {
    if (this.state.message) {
      return <span style={{ ...s.note, color: '#9f1239' }}>Chart error: {this.state.message}</span>
    }
    return this.props.children
  }
}

function DataTable({ payload }: { payload: ChartPayload }) {
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>{payload.chart.x_label}</th>
          {payload.series.map((series) => (
            <th key={series.key} style={{ ...s.th, textAlign: 'right' }}>
              {series.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {payload.points.map((point) => (
          <tr key={point.x}>
            <td style={s.td}>
              {point.x_label as string}
              {point.partial ? ' *' : ''}
            </td>
            {payload.series.map((series) => (
              <td key={series.key} style={{ ...s.td, textAlign: 'right' }}>
                {(point[`${series.key}_label`] ?? point[series.key] ?? '—') as string}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
  tileValueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  tileDot: {
    width: 8,
    height: 8,
    flexShrink: 0,
  },
  tileValue: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: '#111827',
  },
  tileDelta: {
    fontSize: 11,
    fontWeight: 700,
    color: '#6b7280',
  },
  chartSlot: {
    display: 'flex',
    flexDirection: 'column',
    height: 360,
    border: '1px solid #111827',
    background: '#fff',
  },
  chartHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderBottom: '1px solid #111827',
    flexShrink: 0,
  },
  chartTitle: {
    ...labelStyle,
    color: '#111827',
  },
  chartMeta: {
    ...labelStyle,
    color: '#9ca3af',
  },
  chartHeadRight: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
  },
  viewToggle: {
    ...labelStyle,
    color: '#111827',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #111827',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  chartBody: {
    flex: 1,
    padding: '10px 6px 4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  tableBody: {
    flex: 1,
    overflow: 'auto',
    minHeight: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 11,
  },
  th: {
    ...labelStyle,
    color: '#9ca3af',
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '1px solid #111827',
    position: 'sticky',
    top: 0,
    background: '#fff',
  },
  td: {
    padding: '6px 12px',
    borderBottom: '1px solid #f3f4f6',
    color: '#374151',
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: '#6b7280',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 11,
    height: 11,
    display: 'inline-block',
    boxSizing: 'border-box',
  },
  legendLine: {
    width: 14,
    height: 3,
    display: 'inline-block',
  },
  syncNote: {
    ...labelStyle,
    color: '#9ca3af',
  },
  legendBands: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: 14,
    marginLeft: 'auto',
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
