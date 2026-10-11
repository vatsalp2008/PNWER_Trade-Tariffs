import { eventStatus, eventsForScope } from '../data'
import type { ScopeId } from '../data/types'
import { dateLabel } from '../lib/format'

/** Horizontal strip of tariff and policy events for the chosen scope. */
export function PolicyTimeline({ scope }: { scope: ScopeId }) {
  const events = eventsForScope(scope)
  return (
    <ol className="timeline">
      {events.map((e) => {
        const status = eventStatus(e)
        return (
          <li key={e.id} className={`tl-item tl-${e.kind}`}>
            <div className="tl-date">{dateLabel(e.date)}</div>
            <div className="tl-by">{e.imposedBy === 'US' ? 'U.S.' : 'Canada'} · {e.rate}</div>
            <div className="tl-measure">{e.measure}</div>
            <div className="tl-foot">
              <span className={`status status-${status.replace(' ', '-').toLowerCase()}`}>{status}</span>
              {e.sourceUrl && (
                <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="tl-source">
                  Official source ↗
                </a>
              )}
              {!e.verified && <span className="tl-unverified" title="Not yet checked by the team">unverified</span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
