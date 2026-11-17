import { Link } from 'react-router-dom'
import { borderHeadlines } from '../data'
import type { JurisdictionId } from '../data/types'
import type { BorderHeadline } from '../data'
import { monthLabel, num, pct, signedPct } from '../lib/format'

const month = (ym: string) => monthLabel(`${ym}-01`)
/** One-line source credits for the 2-page fact sheet, where every line counts. */
const short = (source: string) =>
  source.startsWith('U.S. Energy Information Administration') ? 'EIA'
    : source.startsWith('U.S. Bureau of Transportation Statistics') ? 'BTS'
    : source.replace('Statistics Canada, table ', 'Statistics Canada ')

const figure = (h: BorderHeadline) => (h.kind === 'share' ? pct(h.share ?? 0) : h.change == null ? '—' : signedPct(h.change, 0))
const tone = (h: BorderHeadline) => (h.kind === 'share' ? 'share' : (h.change ?? 0) < 0 ? 'down' : 'up')
const when = (h: BorderHeadline) =>
  h.kind === 'share' ? (h.period === '12 months' ? `12 months to ${month(h.month)}` : month(h.month)) : `${month(h.month)} vs ${month(h.baseMonth ?? h.month)}`

/** Border and energy indicators for WA and ID; nothing for other places. Fact sheets show the first two. */
export function AcrossBorder({ j, variant }: { j: JurisdictionId; variant: 'panel' | 'sheet' }) {
  const all = borderHeadlines(j)
  const items = variant === 'sheet' ? all.slice(0, 2) : all
  if (!items.length) return null
  const list = (
    <ul className="across-list">
      {items.map((h) => (
        <li key={h.text}>
          <strong className={tone(h)}>{figure(h)}</strong>
          <span>
            {h.text}, {when(h)}
            {variant === 'panel' && h.kind === 'change' && ` (${num(h.value)})`}
          </span>
        </li>
      ))}
    </ul>
  )
  const sources = [...new Set(items.map((h) => h.source))].join('; ')
  if (variant === 'panel') {
    return (
      <div className="across">
        <h4 className="list-title">Across the border</h4>
        {list}
        <p className="micro">
          {sources}. <Link to={`/data?province=${j}`}>More border and trade data →</Link>
        </p>
      </div>
    )
  }
  return (
    <section className="card quote-card across-card">
      <h3>Across the border</h3>
      {list}
      <p className="micro">
        Sources: {[...new Set(items.map((h) => short(h.source)))].join('; ')}. Details on the site's Data page.
      </p>
    </section>
  )
}
