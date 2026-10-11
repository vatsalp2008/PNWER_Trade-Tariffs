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
  const us = j.country === 'US'
  const jobs = e.jobs === null ? 'n/a' : `${e.jobsPartial ? '≥' : ''}${compactNum(e.jobs)}`
  // U.S. tariffs apply to a state's imports from Canada, or to a province's exports to the U.S.
  const flow = us ? 'imports from Canada' : 'exports to the U.S.'
  const tiles: Tile[] =
    mode === 'today'
      ? [
          { lens: 'Integration', value: pct(t.exportShareToPartner), caption: `of ${goods} exports go to ${partner}`, section: 'trade' },
          { lens: 'Competitiveness', value: signedPct(t.growthUsmcaToPartner), caption: `export growth to ${partner} under USMCA (2019→2024)`, section: 'trade' },
          { lens: 'Affordability', value: money(a.estDuties), caption: `estimated U.S. duties on ${flow}, last 12 months`, section: 'affordability' },
          { lens: 'Employment', value: jobs, caption: `jobs in ${industry} (${e.jobsYear})`, section: 'economy' },
        ]
      : [
          { lens: 'Integration', value: pct(s.dutyFreeShare), caption: `of ${flow} cross duty-free today`, section: 'scenario' },
          { lens: 'Competitiveness', value: pct(s.usTariffWithoutUsmca, 1), caption: `average U.S. tariff on this trade without USMCA`, section: 'scenario' },
          { lens: 'Affordability', value: money(s.extraDuties), caption: 'extra U.S. duties per year if USMCA ends', section: 'scenario' },
          { lens: 'Employment', value: jobs, caption: `jobs in ${industry} exposed (${e.jobsYear})`, section: 'economy' },
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
