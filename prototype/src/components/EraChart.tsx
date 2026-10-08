import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ERA } from '../lib/era'
import { money } from '../lib/format'


export interface Marker {
  x: number
  n: number
}

interface Props {
  rolling: [number, number, number][]
  partner: string
  /** Numbered tariff events to mark (numbers match the fact-sheet event table). */
  markers?: Marker[]
  /** Fixed size for print; omit width to fill the container. */
  width?: number
  height: number
  compact?: boolean
}

type Box = { x?: number; y?: number; width?: number; height?: number }

function EventMarker({ vb, n, level }: { vb?: Box; n: number; level: number }) {
  const x = vb?.x ?? 0
  const y = (vb?.y ?? 0) + 9 + level * 17
  return (
    <g>
      <circle cx={x} cy={y} r={7.5} fill="#8a4b2a" />
      <text x={x} y={y + 3.2} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">
        {n}
      </text>
    </g>
  )
}

function EraLabel({ vb, text }: { vb?: Box; text: string }) {
  // Sits just above the plot so it never collides with the lines.
  return (
    <text x={(vb?.x ?? 0) + 2} y={(vb?.y ?? 0) - 6} fontSize={10} fontWeight={600} fill="#6b7268">
      {text}
    </text>
  )
}

export function EraChart({ rolling, partner, markers = [], width, height, compact = false }: Props) {
  const rows = rolling.map(([x, exp, imp]) => ({ x, exp, imp }))
  const latest = rows[rows.length - 1]?.x ?? ERA.end
  // Markers closer than ~2 months alternate between two rows so they stay legible.
  const levels = markers.map((m, k) => (k > 0 && m.x - markers[k - 1].x < 0.17 ? 1 : 0))
  for (let k = 1; k < levels.length; k++) if (levels[k] && levels[k - 1]) levels[k] = 0
  const chart = (
    <ComposedChart
      width={width}
      height={height}
      data={rows}
      margin={compact ? { top: 4, right: 4, bottom: 0, left: 4 } : { top: 18, right: 12, bottom: 0, left: 4 }}
    >
      <ReferenceArea x1={ERA.start} x2={ERA.usmca} fill="#efede6" fillOpacity={1} ifOverflow="hidden"
        label={compact ? undefined : (p: object) => <EraLabel vb={(p as { viewBox?: Box }).viewBox} text="Before USMCA" />} />
      <ReferenceArea x1={ERA.usmca} x2={ERA.tariffs} fill="#e4ecdf" fillOpacity={1} ifOverflow="hidden"
        label={compact ? undefined : (p: object) => <EraLabel vb={(p as { viewBox?: Box }).viewBox} text="USMCA" />} />
      <ReferenceArea x1={ERA.tariffs} x2={ERA.end} fill="#f4e6dc" fillOpacity={1} ifOverflow="hidden"
        label={compact ? undefined : (p: object) => <EraLabel vb={(p as { viewBox?: Box }).viewBox} text="Tariff era" />} />
      {!compact && <CartesianGrid stroke="#ffffff" strokeOpacity={0.9} vertical={false} />}
      <XAxis
        type="number"
        dataKey="x"
        domain={[ERA.start, ERA.end]}
        ticks={compact ? [] : [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]}
        tickFormatter={(v: number) => String(v)}
        tick={{ fontSize: 10, fill: '#6b7268' }}
        hide={compact}
        allowDataOverflow
      />
      <YAxis tickFormatter={money} tick={{ fontSize: 10, fill: '#6b7268' }} width={48} hide={compact} />
      {!compact && (
        <Tooltip
          formatter={(v, name) => [money(Number(v)), name === 'exp' ? `Exports to ${partner}` : `Imports from ${partner}`]}
          labelFormatter={(x) => `12 months to ${monthOf(Number(x))}`}
        />
      )}
      {!compact && (
        <Legend
          verticalAlign="bottom"
          align="right"
          height={16}
          iconSize={10}
          wrapperStyle={{ fontSize: 10 }}
          formatter={(v: string) => (v === 'exp' ? `Exports to ${partner}` : `Imports from ${partner}`)}
        />
      )}
      <Line dataKey="exp" stroke="#2f5a43" strokeWidth={compact ? 1.5 : 2} dot={false} isAnimationActive={false} />
      <Line dataKey="imp" stroke="#b5793a" strokeWidth={compact ? 1.5 : 2} dot={false} isAnimationActive={false} />
      {!compact && (
        <ReferenceLine x={latest} stroke="#6b7268" strokeDasharray="3 3" />
      )}
      {!compact &&
        markers.map((m, k) => (
          <ReferenceLine key={m.n} x={m.x} stroke="#8a4b2a" strokeOpacity={0.5} ifOverflow="extendDomain"
            label={(p: object) => <EventMarker vb={(p as { viewBox?: Box }).viewBox} n={m.n} level={levels[k]} />} />
        ))}
    </ComposedChart>
  )
  if (width) return chart
  return (
    <ResponsiveContainer width="100%" height={height}>
      {chart}
    </ResponsiveContainer>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthOf(x: number) {
  // Rolling points are stamped at month end: year + month/12.
  const y = Math.floor(x - 1e-6)
  const m = Math.round((x - y) * 12)
  return `${MONTHS[(m + 11) % 12]} ${m === 0 ? y - 1 : y}`
}
