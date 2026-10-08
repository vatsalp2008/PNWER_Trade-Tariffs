import type { PartnerShare } from '../data/types'
import { pct } from '../lib/format'

/** Main trading partners on the other side of the border, as shares of trade. */
export function PartnerBars({ rows }: { rows: PartnerShare[] }) {
  const max = Math.max(...rows.map((r) => r.share), 0.01)
  return (
    <ul className="bars">
      {rows.map((r) => (
        <li key={r.name}>
          <span className="bar-label">{r.name}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.share / max) * 100}%` }} />
          </span>
          <span className="bar-value">{pct(r.share)}</span>
        </li>
      ))}
    </ul>
  )
}
