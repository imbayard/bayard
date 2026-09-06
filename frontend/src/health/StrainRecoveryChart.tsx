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

// Band colours ride as an outline on a dark bar, so they are stepped bright:
// the darker set that worked as a fill would read as dark-on-dark here. Checked
// for separation (ΔE 21.6 normal, 8.9 protan) and contrast against the fill.
const TONE_COLOR: Record<Tone, string> = {
  bad: '#f43f5e',
  warn: '#f59e0b',
  good: '#10b981',
  neutral: '#9ca3af',
}

const INK = '#111827'
const MUTED = '#9ca3af'
const RECOVERY_FILL = '#1f2937'
const STRAIN_FILL = '#6b7280'

export default function StrainRecoveryChart({ payload }: { payload: ChartPayload }) {
  const { chart, series, points } = payload
  const bars = series.filter((s) => s.render === 'bar')
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
        <CartesianGrid stroke="#e5e7eb" vertical={!dense} />
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
                // Only strain fades while a cycle is open: it is still
                // accumulating. Recovery is scored once at wake, so today's is
                // as final as any other day's and renders at full strength.
                fillOpacity={!s.bands && p.partial ? 0.45 : 1}
                stroke={s.bands ? TONE_COLOR[(p.band as Tone) ?? 'neutral'] : '#fff'}
                strokeWidth={s.bands ? outlineWidth : 1}
              />
            ))}
          </Bar>
        ))}

        {/* Trendline last so it paints above the bars, and heavier than them —
            it is the thing the chart is about. Drawn twice: a white casing
            underneath so the ink line stays legible crossing a dark bar and a
            white gap alike. */}
        {lines.map((s) => (
          <Line
            key={`${s.key}-casing`}
            yAxisId="value"
            type="monotone"
            dataKey={s.key}
            stroke="#fff"
            strokeWidth={5}
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
            legendType="none"
          />
        ))}
        {lines.map((s) => (
          <Line
            key={s.key}
            yAxisId="value"
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={INK}
            strokeWidth={2.25}
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
