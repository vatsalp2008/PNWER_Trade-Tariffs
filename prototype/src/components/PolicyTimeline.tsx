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
            <span className={`status status-${status.replace(' ', '-').toLowerCase()}`}>{status}</span>
          </li>
        )
      })}
    </ol>
  )
}
