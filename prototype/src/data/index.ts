// Data access layer. The UI only talks to these helpers, so swapping the mock
// data for real data later means changing what is loaded here, nothing else.

import mockRaw from './mock.json?raw'
import { TARIFFS_AS_OF } from '../config'
import { dateLabel } from '../lib/format'
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
  NewsItem,
  RealData,
  ScopeId,
  SectionKey,
  SectorId,
  TariffEvent,
} from './types'

// Real data (from pipeline/build.py) replaces sample data section by section.
// The glob makes real.json optional: without it the site falls back to samples.
const realFiles = import.meta.glob<string>('./real.json', { query: '?raw', import: 'default', eager: true })
const real: RealData | null = realFiles['./real.json'] ? (JSON.parse(realFiles['./real.json']) as RealData) : null
const mock = JSON.parse(mockRaw) as MockData

/** True when a section is backed by real, published data rather than samples. */
export const isReal = (section: SectionKey): boolean => {
  if (!real?.meta.sections[section]) return false
  return section === 'economy' ? !!real.economy && !!real.jurisdictionEconomy : !!real[section]
}
const SECTIONS: SectionKey[] = ['trade', 'economy', 'affordability', 'scenario']
export const realSections = SECTIONS.filter(isReal)
export const allReal = realSections.length === SECTIONS.length
export const sources: string[] = real?.meta.sources ?? []
/** C$ per US$ by month: the rates the dashboard used, so other pages can convert the same way. */
export const fxMonthly: Record<string, number> = real?.meta.fx ?? {}

const newsFiles = import.meta.glob<string>('./news.json', { query: '?raw', import: 'default', eager: true })
const newsData = newsFiles['./news.json'] ? (JSON.parse(newsFiles['./news.json']) as { updated: string; items: NewsItem[] }) : null
export const news: NewsItem[] = newsData?.items ?? []
export const newsUpdated = newsData?.updated ?? null

// "Across the border" headlines for WA and ID (pipeline/regional_indicators.py); optional like real.json.
const headlineFiles = import.meta.glob<string>('./regional-headlines.json', { query: '?raw', import: 'default', eager: true })
export interface BorderHeadline {
  /** "change": vs the same month two years earlier. "share": a part of a whole. */
  kind: 'change' | 'share'
  change?: number | null
  share?: number
  value: number
  month: string
  baseMonth?: string
  /** For shares: "month", or "12 months" ending at `month`. */
  period?: string
  text: string
  source: string
}
const headlineData = headlineFiles['./regional-headlines.json']
  ? (JSON.parse(headlineFiles['./regional-headlines.json']) as { states: Record<string, BorderHeadline[]> })
  : null
export const borderHeadlines = (j: JurisdictionId): BorderHeadline[] => headlineData?.states[j] ?? []

// Canada's counter-tariffs on U.S. goods (pipeline/counter_tariffs.py); optional like real.json.
const counterFiles = import.meta.glob<string>('./counter-tariffs.json', { query: '?raw', import: 'default', eager: true })
export interface CounterTariffMeasure {
  id: string
  name: string
  start: string
  end: string | null
  rates: number[]
  items: number
  /** Items where some specific goods have relief (remission) for all importers. */
  itemsWithProductRelief: number
  /** Canada-wide imports from the U.S. of the listed goods over the window, US$ millions. */
  canadaImportsUsd: number
  note: string | null
  inForce: boolean
  costed: boolean
  notCostedWhy: string | null
  order: string | null
  sourceUrl: string | null
  verified: boolean
}
/** US$ millions over a year at the rates in force on `asOf`: surtax, the listed goods it applies to, and all goods in the scope. */
export interface CounterTariffCost {
  duties: number
  covered: number
  trade: number
}
export interface CounterTariffPlace {
  name: string
  scopes: Record<string, CounterTariffCost>
  byMeasure: Record<string, number>
  /** For a state: the province where goods clear customs; for a province: the state they come from ("other" = everyone else). */
  byPartner: Record<string, number>
  top: { hs4: string; name: string; covered: number; duties: number; rate: number }[]
}
export interface CounterTariffs {
  asOf: string
  window: [string, string]
  measures: CounterTariffMeasure[]
  jurisdictions: Record<string, CounterTariffPlace>
  checks: { name: string; passed: boolean; detail: string }[]
  ended: { name: string; order: string; start: string; end: string; note: string }[]
  notIncluded: string[]
}
export const counterTariffs: CounterTariffs | null = counterFiles['./counter-tariffs.json']
  ? (JSON.parse(counterFiles['./counter-tariffs.json']) as CounterTariffs)
  : null
/** Estimated Canadian counter-tariffs a year on this place's U.S. trade (null when the data isn't built). */
export const counterTariffCost = (j: JurisdictionId, scope: ScopeId): CounterTariffCost | null =>
  counterTariffs?.jurisdictions[j]?.scopes[scope] ?? null

/** Last time the site's content changed (daily news refresh or data rebuild), YYYY-MM-DD. */
export const lastUpdated: string | null = [newsUpdated, real?.meta.generatedAt].filter((d): d is string => !!d).sort().slice(-1)[0] ?? null
/** "Updated Nov 4, 2026 · trade data through Aug 2026", shown on every page. */
export const updatedLine = (): string =>
  `${lastUpdated ? `Updated ${dateLabel(lastUpdated)} · ` : ''}trade data through ${data.meta.dataAsOfLabel}`

/**
 * Updates most relevant to a sector and/or jurisdiction: tagged matches first,
 * then the most recent general items, so the list is never empty.
 */
export function newsFor(sector: SectorId | null, jurisdiction: JurisdictionId | null, limit = 6): NewsItem[] {
  const score = (n: NewsItem) =>
    (sector && n.sectors.includes(sector) ? 2 : 0) + (jurisdiction && n.jurisdictions.includes(jurisdiction) ? 2 : 0) + (n.kind === 'pnwer' ? 0.5 : 0)
  return [...news]
    .sort((a, b) => score(b) - score(a) || b.date.localeCompare(a.date))
    .slice(0, limit)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export const data: MockData = {
  ...mock,
  meta: {
    ...mock.meta,
    sample: !allReal,
    dataAsOf: real?.meta.dataAsOf ?? mock.meta.dataAsOf,
    dataAsOfLabel: real?.meta.dataAsOfLabel ?? mock.meta.dataAsOfLabel,
    note: allReal
      ? 'All figures come from official public sources listed on each section.'
      : realSections.length
        ? 'Sections marked “Sample” use generated placeholder numbers and must not be cited. Other figures come from the official sources listed.'
        : mock.meta.note,
  },
  trade: isReal('trade') ? real!.trade! : mock.trade,
  economy: isReal('economy') ? real!.economy! : mock.economy,
  jurisdictionEconomy: isReal('economy') ? real!.jurisdictionEconomy! : mock.jurisdictionEconomy,
  affordability: isReal('affordability') ? real!.affordability! : mock.affordability,
  scenario: isReal('scenario') ? real!.scenario! : mock.scenario,
}

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
/** For sentences about jobs and output: "industries that make traded goods" or "seafood". */
export const industryNoun = (scope: ScopeId) => (scope === 'all' ? 'industries that make traded goods' : scopeLabel(scope).toLowerCase())

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

/**
 * Two-way trade over the latest 12 months vs. calendar 2024, the last full year
 * before tariffs. null when there was no trade in 2024 (small territories).
 */
export function changeSince2024(j: JurisdictionId, scope: ScopeId): number | null {
  const t = trade(j, scope)
  const a = t.annual.find((x) => x.year === 2024)
  const base = a ? a.exports + a.imports : 0
  return base > 0 ? (t.last12.exports + t.last12.imports) / base - 1 : null
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
