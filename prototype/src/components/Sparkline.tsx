import { ERA } from '../lib/era'

interface Props {
  rolling: [number, number, number][]
  width?: number
  height?: number
}

/** Two-way trade over the previous 12 months; tariff era shaded. */
export function Sparkline({ rolling, width = 96, height = 26 }: Props) {
  const pts = rolling.map(([x, e, i]) => [x, e + i] as const)
  if (pts.length < 2) return null
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const sx = (x: number) => ((x - x0) / (x1 - x0)) * (width - 2) + 1
  const sy = (y: number) => height - 2 - ((y - y0) / (y1 - y0 || 1)) * (height - 4)
  const d = pts.map(([x, y], k) => `${k ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join('')
  const falling = ys[ys.length - 1] < ys[ys.length - 5]
  return (
    <svg width={width} height={height} className="sparkline" aria-hidden="true">
      <rect x={sx(ERA.tariffs)} y={0} width={width - sx(ERA.tariffs)} height={height} fill="#f4e6dc" />
      <path d={d} fill="none" stroke={falling ? '#9c4a2b' : '#2f5a43'} strokeWidth={1.5} />
    </svg>
  )
}
