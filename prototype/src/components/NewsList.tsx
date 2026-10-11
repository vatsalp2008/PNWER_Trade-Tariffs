import { JURISDICTION_BY_ID, SECTOR_BY_ID } from '../data/reference'
import type { NewsItem } from '../data/types'
import { dateLabel } from '../lib/format'

const KIND_LABEL = { official: 'Official', pnwer: 'PNWER', media: 'Team pick' } as const

/** Headlines with source, date and tags; links open the original page. */
export function NewsList({ items, showTags = true }: { items: NewsItem[]; showTags?: boolean }) {
  if (!items.length) return <p className="muted">No updates yet.</p>
  return (
    <ul className="news-list">
      {items.map((n) => (
        <li key={n.id} className="news-item">
          <div className="news-meta">
            <span className={`kind kind-${n.kind}`}>{KIND_LABEL[n.kind]}</span>
            <span>{n.source}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={n.date}>{dateLabel(n.date)}</time>
          </div>
          <a className="news-title" href={n.url} target="_blank" rel="noopener noreferrer">
            {n.title}
          </a>
          {showTags && (n.jurisdictions.length > 0 || n.sectors.length > 0) && (
            <div className="news-tags">
              {n.jurisdictions.map((j) => (
                <span key={j} className="chip">{JURISDICTION_BY_ID[j]?.name ?? j}</span>
              ))}
              {n.sectors.map((s) => (
                <span key={s} className="chip">{SECTOR_BY_ID[s]?.name ?? s}</span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
