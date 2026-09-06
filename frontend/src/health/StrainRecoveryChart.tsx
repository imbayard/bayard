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
import type { Accent, ChartPayload, Tone } from './lib/api'

/**
 * Renders any payload of the backend's chart shape: `series` names the point
 * fields, `points` are already scaled and formatted. Nothing here is
 * WHOOP-specific.
 */

// Band colours ride as an outline on a dark bar, so they are stepped bright:
// the darker set that worked as a fill would read as dark-on-dark here. Checked
// for separation (ΔE 21.6 normal, 8.9 protan) and contrast against the fill.
const TONE_COLOR: Record<Tone, string> = {
  bad: '#f43f5e',
  warn: '#f59e0b',
  good: '#10b981',
  neutral: '#9ca3af',
}

// Trendline accents. `base` is the validated pair (ΔE 26.5 normal, 25.2
// deutan); `light` is only the highlight end of the stroke gradient, which is
// what gives the line its sheen.
const ACCENT: Record<Accent, { base: string; light: string }> = {
  good: { base: '#10b981', light: '#6ee7b7' },
  info: { base: '#3b82f6', light: '#93c5fd' },
}

// Bar fills are held well back so the trendlines carry the chart. The band
// outline stays at full strength — it is the information; the fill is only mass.
const RECOVERY_FILL_OPACITY = 0.35
const STRAIN_FILL_OPACITY = 0.3

const INK = '#111827'
const MUTED = '#9ca3af'
const RECOVERY_FILL = '#1f2937'
const STRAIN_FILL = '#6b7280'

export default function StrainRecoveryChart({ payload }: { payload: ChartPayload }) {
  const { chart, series, points } = payload
  // Recovery leads each group: it is the series the chart is named for, and
  // Recharts lays bars out left-to-right in the order they are declared.
  const bars = series
    .filter((s) => s.render === 'bar')
    .sort((a, b) => Number(Boolean(b.bands)) - Number(Boolean(a.bands)))
  const lines = series.filter((s) => s.render === 'line')
  // The right axis is the same 0-100 scale relabelled in the series' own units,
  // not an independent second scale — two real scales on one plot is the classic
  // way to imply a correlation that isn't there.
  const scaled = bars.find((s) => s.scale_to_value)
  // Past ~40 points a bar is only a few pixels wide, so the outline thins to
  // stay an outline rather than swallowing the fill it is meant to frame.
  const dense = points.length > 40
  const outlineWidth = dense ? 1 : 1.5

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={points}
        margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
        barGap={0}
        barCategoryGap={0}
      >
        {/* Vertical rules read as one per bucket; past ~40 buckets they
            become a wall, so dense views keep horizontals only. */}
        <defs>
          {lines.map((line) => {
            const accent = ACCENT[line.accent ?? 'good']
            return (
              <linearGradient key={line.key} id={`sheen-${line.key}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor={accent.base} />
                <stop offset="45%" stopColor={accent.light} />
                <stop offset="100%" stopColor={accent.base} />
              </linearGradient>
            )
          })}
          {lines.map((line) => (
            <filter key={line.key} id={`glow-${line.key}`} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="3"
                floodColor={ACCENT[line.accent ?? 'good'].base}
                floodOpacity="0.9"
              />
            </filter>
          ))}
        </defs>
        {/* Alternating column wash so one period reads apart from the next
            without adding gaps between the flush bars. */}
        <CartesianGrid
          stroke="#e5e7eb"
          vertical={!dense}
          verticalFill={['#f8fafc', 'transparent']}
          fillOpacity={1}
        />
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

        {/* Bars sit flush — no gap within a group or between days. Recovery is a
            dark bar outlined in its band colour; strain is a pale recessive
            block, so the two read apart without a second hue competing. */}
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
                fill={s.bands ? RECOVERY_FILL : STRAIN_FILL}
                // Only strain fades further while a cycle is open: it is still
                // accumulating. Recovery is scored once at wake, so today's is
                // as final as any other day's.
                fillOpacity={
                  s.bands
                    ? RECOVERY_FILL_OPACITY
                    : p.partial
                      ? STRAIN_FILL_OPACITY / 2
                      : STRAIN_FILL_OPACITY
                }
                stroke={s.bands ? TONE_COLOR[(p.band as Tone) ?? 'neutral'] : '#fff'}
                strokeWidth={s.bands ? outlineWidth : 1}
              />
            ))}
          </Bar>
        ))}

        {/* Trendlines last so they paint above the bars. Each wears a gradient
            stroke plus a coloured outer glow, which is what makes them read as
            the subject of the chart rather than an overlay on it. */}
        {lines.map((s) => (
          <Line
            key={s.key}
            yAxisId="value"
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={`url(#sheen-${s.key})`}
            strokeWidth={2.75}
            strokeLinecap="round"
            filter={`url(#glow-${s.key})`}
            dot={false}
            activeDot={{
              r: 4,
              fill: ACCENT[s.accent ?? 'good'].base,
              stroke: '#fff',
              strokeWidth: 2,
            }}
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

// Exported so the legend paints from the same tokens as the marks rather than
// its own copy, which is how the two drifted apart.
export {
  TONE_COLOR,
  ACCENT,
  RECOVERY_FILL,
  STRAIN_FILL,
  RECOVERY_FILL_OPACITY,
  STRAIN_FILL_OPACITY,
}
