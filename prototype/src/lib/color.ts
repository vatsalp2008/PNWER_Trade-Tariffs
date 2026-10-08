// Small colour scales for the map and chips (no extra dependency).

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const toHex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const mix = (a: string, b: string, t: number) => {
  const x = hex(a)
  const y = hex(b)
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB)
}
const ramp = (stops: string[], t: number) => {
  const c = Math.min(1, Math.max(0, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(c))
  return mix(stops[i], stops[i + 1], c - i)
}

export const SEQ_STOPS = ['#eef0e6', '#c3d3b6', '#7fa27f', '#2f5a43']
export const DIV_STOPS = ['#9c4a2b', '#dcae93', '#f1eee5', '#a9c3a1', '#2f5a43']

/** t in [0, 1] → pale sage to forest green. */
export const sequential = (t: number) => ramp(SEQ_STOPS, t)
/** t in [-1, 1] → clay (decline) through neutral to green (growth). */
export const diverging = (t: number) => ramp(DIV_STOPS, (t + 1) / 2)

export const gradientCss = (stops: string[]) => `linear-gradient(90deg, ${stops.join(', ')})`
