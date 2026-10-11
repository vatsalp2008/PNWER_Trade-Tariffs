// Generates src/data/mock.json: realistic-looking but FAKE numbers in the exact
// shape of src/data/types.ts. Seeded, so every run produces identical output.
//
// Run: npm run mock
//
// Monthly trade is generated per jurisdiction × business, then summed up to
// sectors and "all", so totals always add up. Tariff events from reference.ts
// push trade down after their start dates.

import { writeFileSync } from 'node:fs'
import {
  BUSINESSES,
  JURISDICTIONS,
  PARTNER_JURISDICTIONS,
  SECTORS,
  TARIFF_EVENTS,
} from '../src/data/reference.ts'
import type {
  AffordabilityRecord,
  Business,
  EconomyRecord,
  Exposure,
  Jurisdiction,
  JurisdictionEconomy,
  JurisdictionId,
  MockData,
  ProductValue,
  Quote,
  ScenarioRecord,
  SectorId,
  TariffEvent,
  TradeRecord,
} from '../src/data/types.ts'

// ---------- seeded randomness ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const rng = (...parts: (string | number)[]) => mulberry32(hash(parts.join('|')))
const uniform = (r: () => number, lo: number, hi: number) => lo + (hi - lo) * r()
const gauss = (r: () => number) => {
  const u = Math.max(r(), 1e-9)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r())
}
const sig = (x: number, digits = 3) => (x === 0 ? 0 : Number(x.toPrecision(digits)))
const frac = (x: number) => Math.round(x * 1000) / 1000
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

// ---------- calendar ----------
const START_YEAR = 2017
const END = { year: 2026, month: 8 } // latest month of data
const MONTHS: { year: number; month: number }[] = []
for (let y = START_YEAR; y <= END.year; y++)
  for (let m = 1; m <= 12; m++) if (y < END.year || m <= END.month) MONTHS.push({ year: y, month: m })
const N = MONTHS.length
const monthIndex = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  // A measure starting late in a month mostly affects the next month.
  return (y - START_YEAR) * 12 + (m - 1) + (d > 15 ? 1 : 0)
}

// ---------- scale & mix (2019 levels, USD millions) ----------
const TOTALS_2019: Record<JurisdictionId, { exp: number; imp: number }> = {
  WA: { exp: 7600, imp: 15000 },
  OR: { exp: 2500, imp: 3300 },
  ID: { exp: 1500, imp: 1150 },
  MT: { exp: 950, imp: 5600 },
  AK: { exp: 600, imp: 1150 },
  BC: { exp: 24000, imp: 19000 },
  AB: { exp: 85000, imp: 21000 },
  SK: { exp: 17000, imp: 9500 },
  YT: { exp: 25, imp: 140 },
  NT: { exp: 60, imp: 180 },
}

type Mix = Record<SectorId, number>
const mix = (ag: number, energy: number, mfg: number, forest: number, metals: number, chem: number, other = 0.05): Mix => ({
  ag,
  energy,
  mfg,
  forest,
  metals,
  chem,
  other,
})
const SECTOR_MIX: Record<JurisdictionId, { exp: Mix; imp: Mix }> = {
  WA: { exp: mix(0.22, 0.09, 0.42, 0.11, 0.08, 0.08), imp: mix(0.12, 0.55, 0.12, 0.08, 0.06, 0.07) },
  OR: { exp: mix(0.25, 0.06, 0.35, 0.12, 0.1, 0.12), imp: mix(0.15, 0.2, 0.16, 0.12, 0.1, 0.27) },
  ID: { exp: mix(0.25, 0.03, 0.2, 0.07, 0.37, 0.08), imp: mix(0.3, 0.25, 0.13, 0.12, 0.1, 0.1) },
  MT: { exp: mix(0.42, 0.15, 0.15, 0.06, 0.12, 0.1), imp: mix(0.08, 0.77, 0.05, 0.04, 0.03, 0.03) },
  AK: { exp: mix(0.12, 0.08, 0.07, 0.02, 0.69, 0.02), imp: mix(0.08, 0.57, 0.15, 0.04, 0.1, 0.06) },
  BC: { exp: mix(0.12, 0.25, 0.12, 0.28, 0.15, 0.08), imp: mix(0.18, 0.12, 0.35, 0.08, 0.12, 0.15) },
  AB: { exp: mix(0.07, 0.8, 0.03, 0.01, 0.02, 0.07), imp: mix(0.12, 0.1, 0.45, 0.05, 0.13, 0.15) },
  SK: { exp: mix(0.25, 0.35, 0.05, 0.02, 0.03, 0.3), imp: mix(0.15, 0.12, 0.45, 0.03, 0.1, 0.15) },
  YT: { exp: mix(0.1, 0.05, 0.1, 0.03, 0.7, 0.02), imp: mix(0.15, 0.4, 0.3, 0.02, 0.08, 0.05) },
  NT: { exp: mix(0.03, 0.08, 0.07, 0.01, 0.8, 0.01), imp: mix(0.12, 0.45, 0.3, 0.02, 0.06, 0.05) },
}

const BUSINESS_WEIGHT: Record<string, number> = {
  livestock: 0.2, grains: 0.18, produce: 0.18, seafood: 0.12, dairy: 0.08, beverages: 0.12, agother: 0.12,
  crude: 0.55, natgas: 0.28, electricity: 0.1, energyother: 0.07,
  aerospace: 0.22, machinery: 0.28, autos: 0.22, electronics: 0.2, mfgother: 0.08,
  lumber: 0.45, woodprod: 0.25, paper: 0.3,
  steel: 0.3, aluminum: 0.28, critmin: 0.3, metalsother: 0.12,
  fertilizer: 0.4, plastics: 0.35, chemicals: 0.25,
  consumer: 0.85, special: 0.15,
}
const WEIGHT_OVERRIDES: Partial<Record<JurisdictionId, Record<string, number>>> = {
  AK: { seafood: 0.7, critmin: 0.85 },
  WA: { aerospace: 0.45, produce: 0.3 },
  OR: { electronics: 0.4 },
  ID: { produce: 0.35, critmin: 0.6 },
  MT: { crude: 0.7, livestock: 0.3, grains: 0.35 },
  BC: { lumber: 0.55, natgas: 0.45 },
  AB: { crude: 0.8, livestock: 0.35 },
  SK: { fertilizer: 0.8, grains: 0.5 },
  YT: { critmin: 0.9 },
  NT: { critmin: 0.95 },
}

const MACRO: Record<number, number> = { 2017: 0.93, 2018: 0.97, 2019: 1, 2020: 0.93, 2021: 1.0, 2022: 1.1, 2023: 1.1, 2024: 1.13, 2025: 1.15, 2026: 1.17 }
const ENERGY_PRICE: Record<number, number> = { 2017: 0.85, 2018: 0.95, 2019: 1, 2020: 0.72, 2021: 1.0, 2022: 1.45, 2023: 1.15, 2024: 1.08, 2025: 0.95, 2026: 0.9 }

// ---------- tariff effects ----------
const covers = (e: TariffEvent, biz: string) => e.businesses === 'all' || e.businesses.includes(biz)
const impactOf = (e: TariffEvent) => {
  if (e.kind === 'relief' || e.kind === 'policy') return 0
  const base = Math.min(0.5, (e.rateNum ?? 0.2) * 0.9)
  if (e.usmcaExempt === 'yes') return 0.04
  if (e.usmcaExempt === 'partial') return base * 0.5
  return base
}

/** Multiplier on monthly trade from tariffs imposed by `importer` on business `biz`. */
function tariffFactors(jur: JurisdictionId, biz: string, importer: 'US' | 'CA'): number[] {
  const out = new Array<number>(N).fill(1)
  for (const e of TARIFF_EVENTS) {
    if (e.imposedBy !== importer || !covers(e, biz)) continue
    const hit = impactOf(e) * uniform(rng(jur, biz, e.id, 'coverage'), 0.6, 1)
    if (hit === 0) continue
    const s = monthIndex(e.date)
    const end = e.end ? monthIndex(e.end) : Infinity
    for (let i = Math.max(0, s); i < N; i++) {
      const ramp = i === s ? 0.5 : 1
      const lingering = i >= end ? 0.25 : 1 // trade never fully bounces back
      out[i] *= 1 - hit * ramp * lingering
    }
  }
  // General uncertainty: trade friction from early 2025, more after non-renewal.
  const unc1 = monthIndex('2025-02-01')
  const unc2 = monthIndex('2026-07-01')
  for (let i = unc1; i < N; i++) out[i] *= i >= unc2 ? 0.93 : 0.96
  return out
}

// ---------- monthly series ----------
type Series = { exp: number[]; imp: number[] }

function businessSeries(j: Jurisdiction, biz: Business): Series {
  const r = rng(j.id, biz.id, 'series')
  const sector = SECTORS.find((s) => s.id === biz.sector)!
  const weight = (dir: 'exp' | 'imp') => {
    const list = sector.businesses.map(
      (x) => (WEIGHT_OVERRIDES[j.id]?.[x.id] ?? BUSINESS_WEIGHT[x.id]) * uniform(rng(j.id, x.id, dir, 'w'), 0.75, 1.25),
    )
    const total = list.reduce((a, c) => a + c, 0)
    return list[sector.businesses.indexOf(biz)] / total
  }
  const level = {
    exp: TOTALS_2019[j.id].exp * SECTOR_MIX[j.id].exp[biz.sector] * weight('exp'),
    imp: TOTALS_2019[j.id].imp * SECTOR_MIX[j.id].imp[biz.sector] * weight('imp'),
  }
  const driftPre = uniform(r, 0, 0.03)
  const driftUsmca = uniform(r, -0.01, 0.045)
  const amp = biz.sector === 'ag' ? 0.22 : biz.id === 'natgas' || biz.id === 'electricity' ? 0.2 : 0.05
  const peak = biz.sector === 'ag' ? 10 : biz.sector === 'energy' ? 1 : 6
  const isEnergyPriced = biz.id === 'crude' || biz.id === 'natgas'

  // Flows into the U.S. face U.S. tariffs; flows into Canada face Canadian ones.
  const intoUS = j.country === 'US' ? 'imp' : 'exp'
  const factors = {
    [intoUS]: tariffFactors(j.id, biz.id, 'US'),
    [intoUS === 'imp' ? 'exp' : 'imp']: tariffFactors(j.id, biz.id, 'CA'),
  } as Record<'exp' | 'imp', number[]>

  const out: Series = { exp: [], imp: [] }
  for (const dir of ['exp', 'imp'] as const) {
    const rr = rng(j.id, biz.id, dir, 'noise')
    MONTHS.forEach(({ year, month }, i) => {
      const yearsFrom2019 = year - 2019 + (month - 1) / 12
      const drift = yearsFrom2019 < 0 ? Math.pow(1 + driftPre, yearsFrom2019) : Math.pow(1 + driftUsmca, yearsFrom2019)
      const covid = year === 2020 && month >= 4 && month <= 6 ? 0.78 : 1
      const price = isEnergyPriced ? ENERGY_PRICE[year] : 1
      const season = 1 + amp * Math.cos((2 * Math.PI * (month - peak)) / 12)
      const noise = Math.max(0.6, 1 + 0.045 * gauss(rr))
      out[dir][i] = (level[dir] / 12) * MACRO[year] * drift * covid * price * season * noise * factors[dir][i]
    })
  }
  return out
}

const sumSeries = (list: Series[]): Series => ({
  exp: MONTHS.map((_, i) => list.reduce((a, s) => a + s.exp[i], 0)),
  imp: MONTHS.map((_, i) => list.reduce((a, s) => a + s.imp[i], 0)),
})
const sumWindow = (arr: number[], endIdx: number, len = 12) => arr.slice(endIdx - len + 1, endIdx + 1).reduce((a, c) => a + c, 0)

// ---------- record builders ----------
const SECTOR_RANGES = {
  // [US state: Canada's share of exports], [province: U.S. share of exports]
  exportShare: {
    US: { ag: [0.2, 0.5], energy: [0.4, 0.9], mfg: [0.1, 0.3], forest: [0.3, 0.7], metals: [0.08, 0.4], chem: [0.3, 0.6], other: [0.1, 0.4] },
    CA: { ag: [0.3, 0.6], energy: [0.93, 0.99], mfg: [0.6, 0.85], forest: [0.55, 0.8], metals: [0.4, 0.8], chem: [0.5, 0.75], other: [0.5, 0.8] },
  },
  importShare: {
    US: { ag: [0.15, 0.4], energy: [0.8, 0.98], mfg: [0.05, 0.2], forest: [0.4, 0.8], metals: [0.15, 0.4], chem: [0.15, 0.45], other: [0.05, 0.2] },
    CA: { ag: [0.45, 0.75], energy: [0.5, 0.9], mfg: [0.5, 0.75], forest: [0.6, 0.9], metals: [0.5, 0.8], chem: [0.5, 0.8], other: [0.4, 0.7] },
  },
  // Approx. partner-country total imports by sector, USD millions
  partnerImports: {
    US: { ag: 45000, energy: 40000, mfg: 260000, forest: 18000, metals: 45000, chem: 60000, other: 50000 }, // Canada's imports
    CA: { ag: 230000, energy: 260000, mfg: 1600000, forest: 50000, metals: 160000, chem: 420000, other: 400000 }, // U.S. imports
  },
} as const

function topProducts(j: Jurisdiction, bizList: Business[], last12: Record<string, { exports: number; imports: number }>) {
  const rows: { exp: ProductValue[]; imp: ProductValue[] } = { exp: [], imp: [] }
  for (const biz of bizList) {
    for (const dir of ['exp', 'imp'] as const) {
      const r = rng(j.id, biz.id, dir, 'products')
      const w = biz.products.map((_, k) => Math.pow(r(), 1.3) + (k === 0 ? 1.2 : 0))
      const total = w.reduce((a, c) => a + c, 0)
      const value = dir === 'exp' ? last12[biz.id].exports : last12[biz.id].imports
      biz.products.forEach((p, k) => rows[dir].push({ name: p.name, hs: p.hs, value: (value * w[k]) / total }))
    }
  }
  const top = (list: ProductValue[]) =>
    list
      .sort((a, c) => c.value - a.value)
      .slice(0, 5)
      .map((p) => ({ ...p, value: sig(p.value) }))
  return { topExports: top(rows.exp), topImports: top(rows.imp) }
}

function shareRange(country: 'US' | 'CA', kind: 'exportShare' | 'importShare', sector: SectorId, key: string) {
  const [lo, hi] = SECTOR_RANGES[kind][country][sector]
  return uniform(rng(key, kind), lo, hi)
}

function tradeRecord(j: Jurisdiction, scope: string, s: Series, bizList: Business[], bizLast12: Record<string, { exports: number; imports: number }>): TradeRecord {
  const last = N - 1
  const rolling: [number, number, number][] = []
  MONTHS.forEach(({ year, month }, i) => {
    if (i >= 11 && (month % 3 === 0 || i === last))
      rolling.push([frac(year + month / 12), sig(sumWindow(s.exp, i)), sig(sumWindow(s.imp, i))])
  })
  const annual = []
  for (let y = START_YEAR; y < END.year; y++) {
    const idx = (y - START_YEAR) * 12 + 11
    annual.push({ year: y, exports: sig(sumWindow(s.exp, idx)), imports: sig(sumWindow(s.imp, idx)) })
  }
  const last12 = { exports: sig(sumWindow(s.exp, last)), imports: sig(sumWindow(s.imp, last)) }
  const prev12 = { exports: sig(sumWindow(s.exp, last - 12)), imports: sig(sumWindow(s.imp, last - 12)) }

  // Weighted shares across businesses in scope.
  const weighted = (kind: 'exportShare' | 'importShare') => {
    let num = 0
    let den = 0
    for (const biz of bizList) {
      const v = kind === 'exportShare' ? bizLast12[biz.id].exports : bizLast12[biz.id].imports
      num += v * shareRange(j.country, kind, biz.sector, `${j.id}|${biz.id}`)
      den += v
    }
    return den ? num / den : 0
  }
  const exportShareToPartner = weighted('exportShare')
  const importShareFromPartner = weighted('importShare')
  const r = rng(j.id, scope, 'misc')
  const partnerRank = j.country === 'CA' ? 1 : exportShareToPartner >= 0.3 ? 1 : 2 + Math.floor(r() * 3)

  const names = PARTNER_JURISDICTIONS[j.id]
  const raw = names.map((_, k) => Math.pow(0.62, k) * uniform(r, 0.8, 1.2))
  const rawTotal = raw.reduce((a, c) => a + c, 0)
  const top5 = uniform(r, 0.78, 0.92)
  const partnerJurisdictions = names
    .map((name, k) => ({ name, share: frac((raw[k] / rawTotal) * top5) }))
    .sort((a, c) => c.share - a.share)

  const a2019 = annual.find((x) => x.year === 2019)!
  const a2024 = annual.find((x) => x.year === 2024)!
  const growthUsmcaToPartner = a2019.exports ? a2024.exports / a2019.exports - 1 : 0
  const growthUsmcaToWorld = growthUsmcaToPartner + uniform(r, -0.08, 0.06)

  const partnerTotal = bizList.reduce((acc, biz) => {
    const sectorTotal = SECTOR_RANGES.partnerImports[j.country][biz.sector]
    return acc + sectorTotal * BUSINESS_WEIGHT[biz.id]
  }, 0)
  const shareOfPartnerImports = clamp(last12.exports / partnerTotal, 0, 0.6)

  return {
    rolling,
    annual,
    last12,
    prev12,
    ...topProducts(j, bizList, bizLast12),
    exportShareToPartner: frac(exportShareToPartner),
    importShareFromPartner: frac(importShareFromPartner),
    partnerRank,
    partnerJurisdictions,
    growthUsmcaToPartner: frac(growthUsmcaToPartner),
    growthUsmcaToWorld: frac(growthUsmcaToWorld),
    shareOfPartnerImports: Number(shareOfPartnerImports.toPrecision(3)),
  }
}

// ---------- economy ----------
const GDP_PC_2019: Record<JurisdictionId, number> = { WA: 85000, OR: 62000, ID: 50000, MT: 53000, AK: 78000, BC: 52000, AB: 68000, SK: 60000, YT: 65000, NT: 95000 }
const EMP_RATE_2019: Record<JurisdictionId, number> = { WA: 62, OR: 60, ID: 61, MT: 61, AK: 62, BC: 62, AB: 65, SK: 64, YT: 70, NT: 68 }
const GDP_PC_PATH: Record<number, number> = { 2017: 0.94, 2018: 0.97, 2019: 1, 2020: 0.98, 2021: 1.06, 2022: 1.12, 2023: 1.16, 2024: 1.2, 2025: 1.22 }
const EMP_PATH: Record<number, number> = { 2017: -0.6, 2018: -0.2, 2019: 0, 2020: -4.8, 2021: -2.1, 2022: -0.4, 2023: 0.1, 2024: 0.2, 2025: -0.3 }
const PARTNER_OWNED: Record<JurisdictionId, [number, number]> = {
  WA: [420, 30000], OR: [180, 8400], ID: [65, 3500], MT: [50, 2100], AK: [45, 6300],
  BC: [1100, 120000], AB: [1400, 150000], SK: [300, 25000], YT: [15, 400], NT: [20, 600],
}
const EMP_SHARE: Record<SectorId, number> = { ag: 0.045, energy: 0.008, mfg: 0.07, forest: 0.012, metals: 0.01, chem: 0.006, other: 0.01 }
const EMP_SHARE_OVERRIDES: Partial<Record<JurisdictionId, Partial<Mix>>> = {
  WA: { mfg: 0.08 }, OR: { mfg: 0.09, forest: 0.02 }, ID: { ag: 0.08, mfg: 0.08, forest: 0.015, metals: 0.012 },
  MT: { ag: 0.07 }, AK: { ag: 0.05, energy: 0.03, mfg: 0.02, metals: 0.015 }, BC: { forest: 0.025 },
  AB: { energy: 0.05 }, SK: { ag: 0.1, energy: 0.03, chem: 0.012 }, YT: { ag: 0.01, mfg: 0.01, metals: 0.06 },
  NT: { ag: 0.01, mfg: 0.01, energy: 0.02, metals: 0.08 },
}
const GDP_SHARE: Record<SectorId, number> = { ag: 0.02, energy: 0.02, mfg: 0.08, forest: 0.01, metals: 0.01, chem: 0.008, other: 0.01 }
const GDP_SHARE_OVERRIDES: Partial<Record<JurisdictionId, Partial<Mix>>> = {
  WA: { mfg: 0.09 }, OR: { mfg: 0.11, forest: 0.02 }, ID: { ag: 0.05 }, MT: { ag: 0.04 },
  AK: { energy: 0.12, mfg: 0.02, metals: 0.04 }, BC: { forest: 0.03 }, AB: { energy: 0.2 },
  SK: { ag: 0.08, energy: 0.1, chem: 0.03 }, YT: { mfg: 0.01, metals: 0.15 }, NT: { mfg: 0.01, energy: 0.03, metals: 0.25 },
}
const JOBS_PER_M: Record<SectorId, number> = { ag: 6, energy: 1.5, mfg: 4.5, forest: 5.5, metals: 3.5, chem: 3, other: 4 }

function jurisdictionEconomy(j: Jurisdiction): JurisdictionEconomy {
  const r = rng(j.id, 'economy')
  const gdpPerCapita = Object.entries(GDP_PC_PATH).map(([y, f]) => ({
    year: Number(y),
    value: Math.round((GDP_PC_2019[j.id] * f * uniform(r, 0.985, 1.015)) / 100) * 100,
  }))
  const employmentRate = Object.entries(EMP_PATH).map(([y, d]) => ({
    year: Number(y),
    value: Math.round((EMP_RATE_2019[j.id] + d + uniform(r, -0.3, 0.3)) * 10) / 10,
  }))
  const [, jobs] = PARTNER_OWNED[j.id]
  return {
    gdpPerCapita,
    employmentRate,
    ownedJobs: Math.round((jobs * uniform(r, 0.85, 1.15)) / 50) * 50,
    ownedJobsKind: j.country === 'US' ? 'partner' : 'foreign',
    ownedJobsYear: 2024,
    totalGdp: sig((gdpPerCapita[gdpPerCapita.length - 1].value * j.population) / 1e6),
    totalGdpYear: 2025,
    households: j.households,
    population: j.population,
  }
}

function bizWeight(j: Jurisdiction, biz: Business) {
  const sector = SECTORS.find((s) => s.id === biz.sector)!
  const list = sector.businesses.map((x) => WEIGHT_OVERRIDES[j.id]?.[x.id] ?? BUSINESS_WEIGHT[x.id])
  return (WEIGHT_OVERRIDES[j.id]?.[biz.id] ?? BUSINESS_WEIGHT[biz.id]) / list.reduce((a, c) => a + c, 0)
}

// ---------- affordability & scenario ----------
const TODAY = '2026-10-08'
const inEffect = (e: TariffEvent) => e.date <= TODAY && (!e.end || e.end > TODAY)

function effectiveImportRate(j: Jurisdiction, biz: Business) {
  let rate = 0
  for (const e of TARIFF_EVENTS) {
    if (e.imposedBy !== j.country || !covers(e, biz.id) || !inEffect(e)) continue
    if (e.kind !== 'tariff' && e.kind !== 'counter-tariff') continue
    const coverage = uniform(rng(j.id, biz.id, e.id, 'dutycov'), 0.4, 0.9)
    const r = e.rateNum ?? 0
    if (e.usmcaExempt === 'no') rate += r * coverage
    else if (e.usmcaExempt === 'partial') rate += r * 0.3 * coverage
    else if (e.usmcaExempt === 'yes') rate += r * 0.15 // only non-qualifying goods pay
  }
  return Math.min(rate, 0.6)
}

const MFN = {
  // [lo, hi] standard tariff a partner would charge without USMCA
  CA: { ag: [0.05, 0.15], energy: [0, 0.01], mfg: [0.02, 0.06], forest: [0, 0.02], metals: [0, 0.03], chem: [0.01, 0.05], other: [0.05, 0.15] },
  US: { ag: [0.02, 0.06], energy: [0, 0.01], mfg: [0.02, 0.04], forest: [0, 0.02], metals: [0, 0.03], chem: [0.01, 0.04], other: [0.04, 0.1] },
} as const

function bizAffordScenario(j: Jurisdiction, biz: Business, last12: { exports: number; imports: number }) {
  const r = rng(j.id, biz.id, 'scenario')
  const effRate = effectiveImportRate(j, biz)
  const estDuties = last12.imports * effRate
  const dutyFree = biz.sector === 'energy' ? uniform(r, 0.95, 0.99) : uniform(r, 0.7, 0.95)
  const partner = j.partner
  const [elo, ehi] = MFN[partner][biz.sector] // what the partner charges on our exports
  const [ilo, ihi] = MFN[j.country][biz.sector] // what we charge on partner imports
  const mfnOnExports = uniform(r, elo, ehi) * (biz.id === 'dairy' ? 3 : 1)
  const mfnOnImports = uniform(r, ilo, ihi)
  const intoUS = j.country === 'US' ? last12.imports : last12.exports
  const extra = (last12.exports * mfnOnExports + last12.imports * mfnOnImports + intoUS * 0.1) * dutyFree
  return {
    everyday: last12.imports * biz.everydayShare,
    estDuties,
    priceChange: uniform(r, 0.01, 0.05) + effRate * 0.3,
    dutyFree,
    mfnOnExports,
    mfnOnImports,
    extra,
  }
}

const exposureOf = (share: number): Exposure => (share >= 0.09 ? 'High' : share >= 0.05 ? 'Moderate' : 'Low')

// ---------- quotes (placeholders) ----------
const PLACEHOLDER = 'Placeholder — to be replaced with stakeholder input gathered by PNWER'
const QUOTES: Quote[] = [
  { sector: 'ag', text: 'We used to plan a season ahead. Now we can’t price next month’s shipment to Canada because the tariff could change before it crosses.', attribution: PLACEHOLDER },
  { sector: 'energy', text: 'Our customers on both sides of the border depend on the same pipelines and power lines. Any tariff on energy shows up on household bills.', attribution: PLACEHOLDER },
  { sector: 'mfg', text: 'Our parts cross the border several times before they become a finished product. Each crossing is now a new cost and a new form.', attribution: PLACEHOLDER },
  { sector: 'forest', text: 'Lumber duties were already high. Stacking new tariffs on top means we’ve paused hiring at the mill until there is some certainty.', attribution: PLACEHOLDER },
  { sector: 'metals', text: 'Our buyers have started asking for alternate suppliers outside the region, just to avoid the risk of the next tariff announcement.', attribution: PLACEHOLDER },
  { sector: 'chem', text: 'Fertilizer is a cost every farmer in the region pays. When it gets more expensive, food gets more expensive.', attribution: PLACEHOLDER },
  { sector: 'other', text: 'Small retailers on both sides of the border are absorbing the new costs for now, but that can only last so long.', attribution: PLACEHOLDER },
]

// ---------- build ----------
function build(): MockData {
  const data: MockData = {
    meta: {
      sample: true,
      dataAsOf: `${END.year}-${String(END.month).padStart(2, '0')}`,
      dataAsOfLabel: 'Aug 2026',
      generatedAt: TODAY,
      note: 'SAMPLE DATA. All trade, economic and scenario figures are generated for demonstration only and must not be cited.',
    },
    trade: {} as MockData['trade'],
    economy: {} as MockData['economy'],
    affordability: {} as MockData['affordability'],
    scenario: {} as MockData['scenario'],
    jurisdictionEconomy: {} as MockData['jurisdictionEconomy'],
    quotes: QUOTES,
  }

  for (const j of JURISDICTIONS) {
    const series: Record<string, Series> = {}
    for (const biz of BUSINESSES) series[biz.id] = businessSeries(j, biz)

    const bizLast12: Record<string, { exports: number; imports: number }> = {}
    for (const biz of BUSINESSES)
      bizLast12[biz.id] = { exports: sumWindow(series[biz.id].exp, N - 1), imports: sumWindow(series[biz.id].imp, N - 1) }

    const scopes: { id: string; bizList: Business[] }[] = [
      { id: 'all', bizList: BUSINESSES },
      ...SECTORS.map((s) => ({ id: s.id, bizList: s.businesses })),
      ...BUSINESSES.map((biz) => ({ id: biz.id, bizList: [biz] })),
    ]

    const jEcon = jurisdictionEconomy(j)
    data.jurisdictionEconomy[j.id] = jEcon
    const employed = j.population * 0.48

    data.trade[j.id] = {}
    data.economy[j.id] = {}
    data.affordability[j.id] = {}
    data.scenario[j.id] = {}

    const bizCalc: Record<string, ReturnType<typeof bizAffordScenario>> = {}
    for (const biz of BUSINESSES) bizCalc[biz.id] = bizAffordScenario(j, biz, bizLast12[biz.id])

    for (const { id, bizList } of scopes) {
      const s = bizList.length === 1 ? series[bizList[0].id] : sumSeries(bizList.map((x) => series[x.id]))
      const trade = tradeRecord(j, id, s, bizList, bizLast12)
      data.trade[j.id][id] = trade

      let jobs = 0
      let gdp = 0
      let exportJobs = 0
      for (const biz of bizList) {
        const w = bizWeight(j, biz)
        const er = rng(j.id, biz.id, 'emp')
        jobs += employed * (EMP_SHARE_OVERRIDES[j.id]?.[biz.sector] ?? EMP_SHARE[biz.sector]) * w * uniform(er, 0.85, 1.15)
        gdp += jEcon.totalGdp * (GDP_SHARE_OVERRIDES[j.id]?.[biz.sector] ?? GDP_SHARE[biz.sector]) * w * uniform(er, 0.85, 1.15)
        exportJobs += bizLast12[biz.id].exports * JOBS_PER_M[biz.sector]
      }
      void exportJobs
      const economy: EconomyRecord = {
        jobs: Math.round(jobs / 10) * 10,
        jobsPartial: false,
        jobsYear: 2025,
        gdp: sig(gdp),
        gdpShare: Number((gdp / jEcon.totalGdp).toPrecision(3)),
        gdpYear: 2025,
        gdpScope: id === 'all' ? 'all' : 'sector',
      }
      data.economy[j.id][id] = economy

      const sum = (f: (c: ReturnType<typeof bizAffordScenario>, biz: Business) => number) =>
        bizList.reduce((a, biz) => a + f(bizCalc[biz.id], biz), 0)
      const imports = sum((_, biz) => bizLast12[biz.id].imports)
      const exports = sum((_, biz) => bizLast12[biz.id].exports)
      const estDuties = sum((c) => c.estDuties)
      const afford: AffordabilityRecord = {
        foodFuelInputImports: sig(sum((c) => c.everyday)),
        estDuties: sig(estDuties),
        effectiveDutyRate: frac(imports ? estDuties / imports : 0),
        dutiesPerHousehold: j.country === 'US' ? Math.round((estDuties * 1e6) / j.households) : null,
        priceChange: frac(imports ? sum((c, biz) => c.priceChange * bizLast12[biz.id].imports) / imports : 0),
        priceIndex: j.country === 'US' ? 'import' : 'consumer',
      }
      data.affordability[j.id][id] = afford

      const extra = sum((c) => c.extra)
      const twoWay = imports + exports
      const wAvg = (f: (c: ReturnType<typeof bizAffordScenario>) => number, by: 'imports' | 'exports' | 'both') =>
      {
        const den = by === 'both' ? twoWay : by === 'imports' ? imports : exports
        const num = sum((c, biz) => {
          const v = by === 'both' ? bizLast12[biz.id].imports + bizLast12[biz.id].exports : bizLast12[biz.id][by]
          return f(c) * v
        })
        return den ? num / den : 0
      }
      const extraShare = twoWay ? extra / twoWay : 0
      const dutyFree = wAvg((c) => c.dutyFree, 'both')
      const scenario: ScenarioRecord = {
        dutyFreeShare: frac(dutyFree),
        usTariffWithoutUsmca: frac(wAvg((c) => c.mfnOnImports, 'imports')),
        extraDuties: sig(extra),
        extraDutiesSection301: sig(imports * 0.1 * dutyFree),
        extraDutiesShare: frac(extraShare),
        exposure: exposureOf(extraShare),
      }
      data.scenario[j.id][id] = scenario
    }

    // Invariant: sectors must add up to "all" (same check the real pipeline will run).
    const all = data.trade[j.id].all.last12
    const sectorSum = SECTORS.reduce(
      (acc, s) => ({ exports: acc.exports + data.trade[j.id][s.id].last12.exports, imports: acc.imports + data.trade[j.id][s.id].last12.imports }),
      { exports: 0, imports: 0 },
    )
    for (const k of ['exports', 'imports'] as const)
      if (Math.abs(sectorSum[k] - all[k]) / all[k] > 0.01)
        throw new Error(`${j.id}: sector ${k} (${sectorSum[k]}) do not add up to total (${all[k]})`)
  }
  return data
}

const data = build()
const outPath = new URL('../src/data/mock.json', import.meta.url)
writeFileSync(outPath, JSON.stringify(data))
const kb = (JSON.stringify(data).length / 1024).toFixed(0)
console.log(`Wrote src/data/mock.json (${kb} KB) — ${JURISDICTIONS.length} jurisdictions × ${1 + SECTORS.length + BUSINESSES.length} scopes`)
