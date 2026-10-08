import { affordability, economy, goodsNoun, industryNoun, partnerName, scenario, trade } from '../data'
import type { Jurisdiction, ScopeId } from '../data/types'
import { compactNum, money, pct, signedPct } from '../lib/format'

export type Mode = 'today' | 'noUsmca'

interface Tile {
  lens: string
  value: string
  caption: string
}

/** One headline number for each of PNWER's four lenses. */
export function LensTiles({ j, scope, mode }: { j: Jurisdiction; scope: ScopeId; mode: Mode }) {
  const t = trade(j.id, scope)
  const a = affordability(j.id, scope)
  const e = economy(j.id, scope)
  const s = scenario(j.id, scope)
  const partner = partnerName(j)
  const goods = goodsNoun(scope)
  const industry = industryNoun(scope)
  const tiles: Tile[] =
    mode === 'today'
      ? [
          { lens: 'Integration', value: pct(t.exportShareToPartner), caption: `of ${goods} exports go to ${partner}` },
          { lens: 'Competitiveness', value: signedPct(t.growthUsmcaToPartner), caption: `export growth to ${partner} under USMCA (2019→2024)` },
          { lens: 'Affordability', value: money(a.estDutiesToday), caption: 'estimated yearly duties on imports at today’s tariffs' },
          { lens: 'Employment', value: compactNum(e.sectorJobs), caption: `jobs in ${industry}` },
        ]
      : [
          { lens: 'Integration', value: pct(s.usmcaDutyFreeShare), caption: 'of this trade enters duty-free under USMCA today' },
          { lens: 'Competitiveness', value: pct(s.mfnOnExports, 1), caption: `tariff ${j.name}’s exports would face without USMCA` },
          { lens: 'Affordability', value: money(s.extraDuties), caption: 'extra duties per year if USMCA ends' },
          { lens: 'Employment', value: compactNum(e.jobsSupportedByExports), caption: `jobs supported by exports to ${partner} (estimate)` },
        ]
  return (
    <div className="lens-tiles">
      {tiles.map((x) => (
        <div className="lens-tile" key={x.lens}>
          <div className="lens-name">{x.lens}</div>
          <div className="lens-value">{x.value}</div>
          <div className="lens-caption">{x.caption}</div>
        </div>
      ))}
    </div>
  )
}
