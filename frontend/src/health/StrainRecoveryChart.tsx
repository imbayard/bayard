import {
  Bar,
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
  const bars = series.filter((s) => s.render === 'bar')
  // The banded series is the outer bar (capacity); the other nests inside it.
  const recoveryBar = bars.find((s) => s.bands)
  const strainBar = bars.find((s) => !s.bands)
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

        {/* One bar per period: recovery is the capacity the day started with,
            strain the portion of it actually spent. Nesting them makes the
            comparison a height against a height — strain rising past the top of
            the recovery bar is an overreach, falling well short is capacity
            left on the table. Both already share the 0-100 axis, so this is a
            real comparison rather than two scales side by side. */}
        {recoveryBar && (
          <Bar
            yAxisId="value"
            dataKey={recoveryBar.key}
            name={recoveryBar.label}
            isAnimationActive={false}
            background={{ fill: 'transparent' }}
            shape={
              <NestedBar
                strainKey={strainBar?.key ?? 'strain'}
                valueMax={chart.value_max}
                outlineWidth={outlineWidth}
              />
            }
          />
        )}

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

interface NestedBarProps {
  // Supplied by Recharts when it clones the shape element.
  x?: number
  y?: number
  width?: number
  height?: number
  payload?: Record<string, number | string | boolean | null>
  background?: { y: number; height: number }
  // Supplied by us.
  strainKey: string
  valueMax: number
  outlineWidth: number
}

/** Recovery as the outer bar, strain nested inside it.
 *
 *  Both are measured from the same baseline with the same pixels-per-unit, so
 *  the inner bar's height can be read directly against the outer one. Strain is
 *  drawn even when it exceeds recovery — that overshoot is the signal, so it is
 *  never clipped to the capacity bar. */
function NestedBar({
  x,
  y,
  width,
  height,
  payload,
  background,
  strainKey,
  valueMax,
  outlineWidth,
}: NestedBarProps) {
  if (x == null || width == null || width <= 0) return null

  const band = (payload?.band as Tone | null) ?? 'neutral'
  const partial = Boolean(payload?.partial)
  const strain = payload?.[strainKey]
  const recovery = payload?.recovery

  // Prefer the plot rect for scale: it is defined even on days with no recovery
  // bar to measure against. Fall back to the bar's own geometry.
  const baseline =
    background != null ? background.y + background.height : (y ?? 0) + (height ?? 0)
  const unit =
    background != null && valueMax > 0
      ? background.height / valueMax
      : typeof recovery === 'number' && recovery > 0 && height != null
        ? height / recovery
        : 0

  const innerWidth = Math.max(1, width * 0.46)
  const innerX = x + (width - innerWidth) / 2
  const strainHeight = typeof strain === 'number' && unit > 0 ? strain * unit : 0

  return (
    <g>
      {height != null && height > 0 && (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={RECOVERY_FILL}
          fillOpacity={RECOVERY_FILL_OPACITY}
          stroke={TONE_COLOR[band]}
          strokeWidth={outlineWidth}
        />
      )}
      {strainHeight > 0 && (
        <rect
          x={innerX}
          y={baseline - strainHeight}
          width={innerWidth}
          height={strainHeight}
          fill={STRAIN_FILL}
          fillOpacity={partial ? STRAIN_FILL_OPACITY : STRAIN_FILL_OPACITY + 0.35}
        />
      )}
    </g>
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
