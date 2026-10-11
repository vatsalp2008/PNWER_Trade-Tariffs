// Number and date formatting. Money inputs are USD millions unless noted.

const MINUS = '−'

export function money(m: number): string {
  if (m === 0) return '$0'
  const sign = m < 0 ? MINUS : ''
  const a = Math.abs(m)
  if (a >= 100000) return `${sign}$${Math.round(a / 1000)}B`
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(1)}B`
  if (a >= 100) return `${sign}$${Math.round(a)}M`
  if (a >= 1) return `${sign}$${a.toFixed(1)}M`
  return `${sign}$${Math.round(a * 1000)}K`
}

/** Whole US dollars, e.g. per-household figures. */
export const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

export const num = (n: number) => Math.round(n).toLocaleString('en-US')

export const compactNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : num(n)

export const pct = (f: number, digits = 0) => `${(f * 100).toFixed(digits)}%`

export function signedPct(f: number, digits = 1): string {
  const v = (f * 100).toFixed(digits)
  if (Number(v) === 0) return `0${digits ? '.' + '0'.repeat(digits) : ''}%`
  return f > 0 ? `+${v}%` : `${MINUS}${v.replace('-', '')}%`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2025-03-04' → 'Mar 4, 2025' */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** '2025-03-04' → 'Mar 2025' */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

/** '2025-03-04' → decimal year for time axes. */
export function decimalYear(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  const start = Date.UTC(y, 0, 1)
  const days = (Date.UTC(y, m - 1, d) - start) / 86_400_000
  return y + days / 365
}
