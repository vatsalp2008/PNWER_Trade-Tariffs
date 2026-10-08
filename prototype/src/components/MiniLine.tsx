/** Tiny single-series line for small trends (GDP per person, employment rate). */
export function MiniLine({ values, width = 120, height = 30 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const sx = (k: number) => (k / (values.length - 1)) * (width - 4) + 2
  const sy = (v: number) => height - 3 - ((v - lo) / (hi - lo || 1)) * (height - 6)
  const d = values.map((v, k) => `${k ? 'L' : 'M'}${sx(k).toFixed(1)},${sy(v).toFixed(1)}`).join('')
  const last = values.length - 1
  return (
    <svg width={width} height={height} className="miniline" aria-hidden="true">
      <path d={d} fill="none" stroke="#2f5a43" strokeWidth={1.5} />
      <circle cx={sx(last)} cy={sy(values[last])} r={2.5} fill="#2f5a43" />
    </svg>
  )
}
