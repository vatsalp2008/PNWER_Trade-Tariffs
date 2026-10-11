import { affordability, economy, goodsNoun, industryNoun, isReal, partnerName, scenario, trade } from '../data'
import type { Jurisdiction, ScopeId, SectionKey } from '../data/types'
import { compactNum, money, pct, signedPct } from '../lib/format'

export type Mode = 'today' | 'noUsmca'

interface Tile {
  lens: string
  value: string
  caption: string
  section: SectionKey
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
          { lens: 'Integration', value: pct(t.exportShareToPartner), caption: `of ${goods} exports go to ${partner}`, section: 'trade' },
          { lens: 'Competitiveness', value: signedPct(t.growthUsmcaToPartner), caption: `export growth to ${partner} under USMCA (2019→2024)`, section: 'trade' },
          { lens: 'Affordability', value: money(a.estDutiesToday), caption: 'estimated yearly duties on imports at today’s tariffs', section: 'affordability' },
          { lens: 'Employment', value: compactNum(e.sectorJobs), caption: `jobs in ${industry}`, section: 'economy' },
        ]
      : [
          { lens: 'Integration', value: pct(s.usmcaDutyFreeShare), caption: 'of this trade enters duty-free under USMCA today', section: 'scenario' },
          { lens: 'Competitiveness', value: pct(s.mfnOnExports, 1), caption: `tariff ${j.name}’s exports would face without USMCA`, section: 'scenario' },
          { lens: 'Affordability', value: money(s.extraDuties), caption: 'extra duties per year if USMCA ends', section: 'scenario' },
          { lens: 'Employment', value: compactNum(e.jobsSupportedByExports), caption: `jobs supported by exports to ${partner} (estimate)`, section: 'economy' },
        ]
  return (
    <div className="lens-tiles">
      {tiles.map((x) => (
        <div className="lens-tile" key={x.lens}>
          <div className="lens-name">
            {x.lens}
            {!isReal(x.section) && <span className="sample-tag">Sample</span>}
          </div>
          <div className="lens-value">{x.value}</div>
          <div className="lens-caption">{x.caption}</div>
        </div>
      ))}
    </div>
  )
}
