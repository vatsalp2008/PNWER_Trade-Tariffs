import { Link } from 'react-router-dom'
import { changeSince2024, sideTotals, trade } from '../data'
import { SECTOR_BY_ID, SECTORS } from '../data/reference'
import type { Business, JurisdictionId, SectorId } from '../data/types'
import { money, signedPct } from '../lib/format'
import { Sparkline } from './Sparkline'
import { TariffChips } from './TariffChips'

interface Props {
  sector: SectorId | 'all'
  jurisdiction: JurisdictionId | 'ALL'
  highlight?: string
}

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="muted-dash" title="No trade in 2024 to compare with">—</span>
  return <span className={value < 0 ? 'down' : 'up'}>{signedPct(value)}</span>
}

export function BusinessesTable({ sector, jurisdiction, highlight }: Props) {
  const businesses: Business[] = sector === 'all' ? SECTORS.flatMap((s) => s.businesses) : SECTOR_BY_ID[sector].businesses
  const region = jurisdiction === 'ALL'
  return (
    <div className="table-wrap">
      <table className="biz-table">
        <thead>
          {region ? (
            <tr>
              <th>Business</th>
              <th className="r">U.S. states ↔ Canada</th>
              <th className="r">Provinces ↔ U.S.</th>
              <th>Tariffs today</th>
              <th>Trend</th>
            </tr>
          ) : (
            <tr>
              <th>Business</th>
              <th className="r">Two-way trade</th>
              <th className="r">Since 2024</th>
              <th>Tariffs today</th>
              <th>Trend</th>
              <th />
            </tr>
          )}
        </thead>
        <tbody>
          {businesses.map((biz) => {
            const sectorName = sector === 'all' ? SECTOR_BY_ID[biz.sector].name : null
            const label = (
              <>
                <span className="biz-name">{biz.name}</span>
                {sectorName && <span className="biz-sector">{sectorName}</span>}
              </>
            )
            if (region) {
              const us = sideTotals('US', biz.id)
              const ca = sideTotals('CA', biz.id)
              return (
                <tr key={biz.id} className={highlight === biz.id ? 'is-highlight' : ''}>
                  <td>{label}</td>
                  <td className="r">
                    {money(us.last12.exports + us.last12.imports)} <Change value={us.changeSince2024} />
                  </td>
                  <td className="r">
                    {money(ca.last12.exports + ca.last12.imports)} <Change value={ca.changeSince2024} />
                  </td>
                  <td>
                    <TariffChips scope={biz.id} />
                  </td>
                  <td>
                    <Sparkline rolling={us.rolling} />
                  </td>
                </tr>
              )
            }
            const t = trade(jurisdiction, biz.id)
            return (
              <tr key={biz.id} className={highlight === biz.id ? 'is-highlight' : ''}>
                <td>{label}</td>
                <td className="r">{money(t.last12.exports + t.last12.imports)}</td>
                <td className="r">
                  <Change value={changeSince2024(jurisdiction, biz.id)} />
                </td>
                <td>
                  <TariffChips scope={biz.id} />
                </td>
                <td>
                  <Sparkline rolling={t.rolling} />
                </td>
                <td className="r">
                  <Link className="text-link" to={`/factsheet/${jurisdiction}/${biz.id}`}>
                    Fact sheet →
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
