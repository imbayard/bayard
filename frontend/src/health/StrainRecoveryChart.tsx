import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartPayload, Tone } from './lib/api'

/**
 * Renders any payload of the backend's chart shape: `series` names the point
 * fields, `points` are already scaled and formatted. Nothing here is
 * WHOOP-specific.
 */

// Stepped so adjacent bands stay apart for colorblind readers as well as
// full-colour ones — the obvious red/amber/green trio failed on both counts.
const TONE_COLOR: Record<Tone, string> = {
  bad: '#9f1239',
  warn: '#f59e0b',
  good: '#047857',
  neutral: '#6b7280',
}

const INK = '#111827'
const MUTED = '#9ca3af'
const STRAIN_FILL = '#6b7280'

export default function StrainRecoveryChart({ payload }: { payload: ChartPayload }) {
  const { chart, series, points } = payload
  const bars = series.filter((s) => s.render === 'bar')
  const lines = series.filter((s) => s.render === 'line')
  // The right axis is the same 0-100 scale relabelled in the series' own units,
  // not an independent second scale — two real scales on one plot is the classic
  // way to imply a correlation that isn't there.
  const scaled = bars.find((s) => s.scale_to_value)
  // Bars are flush, so a 1px surface stroke is what keeps neighbours apart —
  // but past ~40 points each bar is only a few pixels wide and the stroke would
  // eat the fill. Dense views drop it and rely on the trendline instead.
  const separatorWidth = points.length > 40 ? 0 : 1

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={points}
        margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
        barGap={0}
        barCategoryGap={0}
      >
        <CartesianGrid stroke="#e5e7eb" vertical={false} />
        <XAxis
          dataKey="x_label"
          tick={{ fontSize: 9, fill: MUTED }}
          tickLine={false}
          axisLine={{ stroke: INK }}
          minTickGap={14}
        />
        <YAxis
          yAxisId="value"
          domain={[chart.value_min, chart.value_max]}
          ticks={[0, 34, 67, 100]}
          tick={{ fontSize: 9, fill: MUTED }}
          tickLine={false}
          axisLine={false}
          width={34}
        />
        {scaled && (
          <YAxis
            yAxisId="value"
            orientation="right"
            domain={[chart.value_min, chart.value_max]}
            ticks={[0, 33.333, 66.667, 100]}
            tickFormatter={(v: number) => String(Math.round(v / scaled.scale_to_value!))}
            tick={{ fontSize: 9, fill: MUTED }}
            tickLine={false}
            axisLine={false}
            width={24}
          />
        )}
        <Tooltip content={<ChartTooltip source={payload} />} cursor={{ fill: '#f3f4f6' }} />

        {/* Bars sit flush — no gap within a group or between days. The 1px
            surface stroke keeps touching fills legible without adding space. */}
        {bars.map((s) => (
          <Bar
            key={s.key}
            yAxisId="value"
            dataKey={s.key}
            name={s.label}
            barSize={undefined}
            isAnimationActive={false}
          >
            {points.map((p, i) => (
              <Cell
                key={i}
                fill={
                  s.bands
                    ? TONE_COLOR[(p.band as Tone) ?? 'neutral']
                    : STRAIN_FILL
                }
                fillOpacity={p.partial ? 0.4 : 0.85}
                stroke="#fff"
                strokeWidth={separatorWidth}
              />
            ))}
          </Bar>
        ))}

        {/* Trendline last so it paints above the bars, and heavier than them —
            it is the thing the chart is about. */}
        {lines.map((s) => (
          <Line
            key={s.key}
            yAxisId="value"
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={INK}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: INK, stroke: '#fff', strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

interface TooltipProps {
  active?: boolean
  label?: string
  /** Named `source`, not `payload`: Recharts overwrites a prop called `payload`
   *  on the content element with its own array of hovered slices. */
  source?: ChartPayload
}

function ChartTooltip({ active, label, source }: TooltipProps) {
  if (!active || !source) return null
  const point = source.points.find((p) => p.x_label === label)
  if (!point) return null

  return (
    <div style={t.box}>
      <span style={t.head}>
        {point.x_label as string}
        {point.partial ? ' · in progress' : ''}
      </span>
      {source.series.map((s) => {
        const shown = (point[`${s.key}_label`] ?? point[s.key]) as string | number | null
        if (shown === null || shown === undefined) return null
        return (
          <span key={s.key} style={t.row}>
            <span style={t.name}>{s.label}</span>
            <span style={t.value}>{shown}</span>
          </span>
        )
      })}
    </div>
  )
}

const t: Record<string, React.CSSProperties> = {
  box: {
    background: '#fff',
    border: `1px solid ${INK}`,
    borderRadius: 0,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 132,
  },
  head: {
    fontSize: 10,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: INK,
    paddingBottom: 4,
    borderBottom: '1px solid #e5e7eb',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    fontSize: 11,
  },
  name: { color: '#6b7280' },
  value: { color: INK, fontWeight: 700 },
}

export { TONE_COLOR }
