import { eventStatus } from '../data'
import type { TariffEvent } from '../data/types'
import { dateLabel } from '../lib/format'

const EXEMPT_LABEL = { yes: 'Yes', no: 'No', partial: 'Partly', 'n/a': '—' } as const

/** Numbered list of tariff and policy events; numbers match the chart markers. */
export function TariffTable({ events }: { events: TariffEvent[] }) {
  return (
    <table className="tariff-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Date</th>
          <th>Action</th>
          <th>By</th>
          <th>Rate</th>
          <th>USMCA-exempt?</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e, k) => {
          const status = eventStatus(e)
          return (
            <tr key={e.id}>
              <td className="num-cell">{k + 1}</td>
              <td className="nowrap">{dateLabel(e.date)}</td>
              <td>{e.measure}</td>
              <td>{e.imposedBy === 'US' ? 'U.S.' : 'Canada'}</td>
              <td className="nowrap">{e.rate}</td>
              <td>{EXEMPT_LABEL[e.usmcaExempt]}</td>
              <td>
                <span className={`status status-${status.replace(' ', '-').toLowerCase()}`}>{status}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
