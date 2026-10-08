// Data access layer. The UI only talks to these helpers, so swapping the mock
// data for real data later means changing what is loaded here, nothing else.

import mockRaw from './mock.json?raw'
import { TARIFFS_AS_OF } from '../config'
import {
  BUSINESS_BY_ID,
  COUNTRY_NAME,
  JURISDICTION_BY_ID,
  JURISDICTIONS,
  SECTOR_BY_ID,
  SECTORS,
  TARIFF_EVENTS,
} from './reference'
import type {
  Business,
  Jurisdiction,
  JurisdictionId,
  MockData,
  ScopeId,
  SectorId,
  TariffEvent,
} from './types'

export const data = JSON.parse(mockRaw) as MockData

export const trade = (j: JurisdictionId, scope: ScopeId) => data.trade[j][scope]
export const economy = (j: JurisdictionId, scope: ScopeId) => data.economy[j][scope]
export const affordability = (j: JurisdictionId, scope: ScopeId) => data.affordability[j][scope]
export const scenario = (j: JurisdictionId, scope: ScopeId) => data.scenario[j][scope]
export const jurisdictionEconomy = (j: JurisdictionId) => data.jurisdictionEconomy[j]

export const partnerName = (j: Jurisdiction) => COUNTRY_NAME[j.partner]
/** "Canada" / "U.S." for headings. */
export const partnerShort = (j: Jurisdiction) => (j.partner === 'CA' ? 'Canada' : 'U.S.')

export const isJurisdictionId = (x: string | undefined): x is JurisdictionId => !!x && x in JURISDICTION_BY_ID

export function isScope(x: string | undefined): x is ScopeId {
  return !!x && (x === 'all' || x in SECTOR_BY_ID || x in BUSINESS_BY_ID)
}

export function scopeSector(scope: ScopeId): SectorId | null {
  if (scope in SECTOR_BY_ID) return scope as SectorId
  return BUSINESS_BY_ID[scope]?.sector ?? null
}

export function scopeLabel(scope: ScopeId): string {
  if (scope === 'all') return 'All traded goods'
  return SECTOR_BY_ID[scope as SectorId]?.name ?? BUSINESS_BY_ID[scope]?.name ?? scope
}

/** For sentences about trade: "goods" or "seafood". */
export const goodsNoun = (scope: ScopeId) => (scope === 'all' ? 'goods' : scopeLabel(scope).toLowerCase())
/** For sentences about jobs and output: "traded-goods industries" or "seafood". */
export const industryNoun = (scope: ScopeId) => (scope === 'all' ? 'traded-goods industries' : scopeLabel(scope).toLowerCase())

export function scopeBusinesses(scope: ScopeId): Business[] {
  if (scope === 'all') return SECTORS.flatMap((s) => s.businesses)
  const sector = SECTOR_BY_ID[scope as SectorId]
  if (sector) return sector.businesses
  const biz = BUSINESS_BY_ID[scope]
  return biz ? [biz] : []
}

const covers = (e: TariffEvent, bizIds: string[]) =>
  e.businesses === 'all' || e.businesses.some((id) => bizIds.includes(id))

/** Tariff and policy events touching any business in scope, oldest first. */
export function eventsForScope(scope: ScopeId): TariffEvent[] {
  const ids = scopeBusinesses(scope).map((x) => x.id)
  return TARIFF_EVENTS.filter((e) => covers(e, ids)).sort((a, c) => a.date.localeCompare(c.date))
}

export const isInEffect = (e: TariffEvent, asOf = TARIFFS_AS_OF) => e.date <= asOf && (!e.end || e.end > asOf)

export type EventStatus = 'In effect' | 'Ended' | 'Relief' | 'Policy'
export function eventStatus(e: TariffEvent): EventStatus {
  if (e.kind === 'relief') return 'Relief'
  if (e.kind === 'policy') return 'Policy'
  return isInEffect(e) ? 'In effect' : 'Ended'
}

export type SideStatus = 'tariffed' | 'exempt' | 'none'
/** Current tariff status for a scope, by which country imposes it. */
export function tariffStatus(scope: ScopeId): { us: SideStatus; ca: SideStatus } {
  const active = eventsForScope(scope).filter(
    (e) => (e.kind === 'tariff' || e.kind === 'counter-tariff') && isInEffect(e),
  )
  const side = (c: 'US' | 'CA'): SideStatus => {
    const list = active.filter((e) => e.imposedBy === c)
    if (list.some((e) => e.usmcaExempt === 'no' || e.usmcaExempt === 'partial')) return 'tariffed'
    if (list.length) return 'exempt'
    return 'none'
  }
  return { us: side('US'), ca: side('CA') }
}

/** The few events worth marking on a chart: milestones first, then the steepest measures. */
export function keyEvents(scope: ScopeId, max = 6): TariffEvent[] {
  const milestone: Record<string, number> = { 'us-ieepa': 100, 'usmca-review': 95, 'scotus-ieepa': 80, 'us-338': 90, 'us-301': 60 }
  const score = (e: TariffEvent) =>
    milestone[e.id] ??
    (e.kind === 'relief' || e.kind === 'policy' ? 10 : e.usmcaExempt === 'no' ? 40 + (e.rateNum ?? 0) * 40 : 20)
  const picked: TariffEvent[] = []
  for (const e of [...eventsForScope(scope)].sort((a, c) => score(c) - score(a))) {
    if (picked.length >= max) break
    const tooClose = picked.some((p) => Math.abs(Date.parse(p.date) - Date.parse(e.date)) < 45 * 86_400_000)
    if (!tooClose) picked.push(e)
  }
  return picked.sort((a, c) => a.date.localeCompare(c.date))
}

/**
 * Events to list on a fact sheet: everything if it fits, otherwise the chart's
 * key events, measures still in effect, and the most recent ones.
 */
export function factSheetEvents(scope: ScopeId, max = 10): { shown: TariffEvent[]; total: number } {
  const all = eventsForScope(scope)
  if (all.length <= max) return { shown: all, total: all.length }
  const key = new Set(keyEvents(scope).map((e) => e.id))
  const rank = (e: TariffEvent) =>
    (key.has(e.id) ? 1000 : 0) + (isInEffect(e) && e.kind !== 'relief' && e.kind !== 'policy' ? 500 : 0) + Date.parse(e.date) / 1e10
  const shown = [...all].sort((a, c) => rank(c) - rank(a)).slice(0, max)
  return { shown: shown.sort((a, c) => a.date.localeCompare(c.date)), total: all.length }
}

export type Side = 'US' | 'CA'
/** Region totals for one side of the border (never add the two sides: same shipments). */
export function sideTotals(side: Side, scope: ScopeId) {
  const list = JURISDICTIONS.filter((j) => j.country === side)
  const sum = (f: (id: JurisdictionId) => number) => list.reduce((a, j) => a + f(j.id), 0)
  const last12 = {
    exports: sum((id) => trade(id, scope).last12.exports),
    imports: sum((id) => trade(id, scope).last12.imports),
  }
  const base2024 = sum((id) => {
    const a = trade(id, scope).annual.find((x) => x.year === 2024)!
    return a.exports + a.imports
  })
  const rolling = trade(list[0].id, scope).rolling.map(([x], i) => [
    x,
    sum((id) => trade(id, scope).rolling[i][1]),
    sum((id) => trade(id, scope).rolling[i][2]),
  ]) as [number, number, number][]
  return { last12, changeSince2024: (last12.exports + last12.imports) / base2024 - 1, rolling }
}

/** Two-way trade over the latest 12 months vs. calendar 2024, the last full year before tariffs. */
export function changeSince2024(j: JurisdictionId, scope: ScopeId) {
  const t = trade(j, scope)
  const a = t.annual.find((x) => x.year === 2024)!
  return (t.last12.exports + t.last12.imports) / (a.exports + a.imports) - 1
}

export const twoWay = (j: JurisdictionId, scope: ScopeId) => {
  const t = trade(j, scope).last12
  return t.exports + t.imports
}

// Basic checks on load — the same kind a real pipeline must pass before publishing.
function validate(d: MockData) {
  const problems: string[] = []
  for (const j of JURISDICTIONS) {
    const all = d.trade[j.id]?.all
    if (!all) {
      problems.push(`${j.id}: missing data`)
      continue
    }
    const sectorExports = SECTORS.reduce((a, s) => a + d.trade[j.id][s.id].last12.exports, 0)
    if (Math.abs(sectorExports - all.last12.exports) / all.last12.exports > 0.01)
      problems.push(`${j.id}: sectors do not add up to the total`)
    for (const [scope, t] of Object.entries(d.trade[j.id])) {
      if (t.exportShareToPartner < 0 || t.exportShareToPartner > 1) problems.push(`${j.id}/${scope}: share out of range`)
      if (t.rolling.some(([, e, i]) => e < 0 || i < 0)) problems.push(`${j.id}/${scope}: negative trade`)
    }
  }
  if (problems.length) console.warn('Data checks failed:', problems)
}
if (import.meta.env.DEV) validate(data)
