/** Washington & Idaho extras (pipeline/regional_indicators.py): trade by NAICS industry, border crossings, Canadian travellers. */
import { checkedResponse } from './provincial'

/** Places on the Data & verification page, in menu order. */
export const PLACES: Record<string, string> = { WA: 'Washington', ID: 'Idaho', BC: 'British Columbia', AB: 'Alberta' }
export const isStatePlace = (p: string | null): p is 'WA' | 'ID' => p === 'WA' || p === 'ID'

type Series = (number | null)[]

export interface RegionalDataset {
  schemaVersion: number
  states: Record<string, string>
  sources: Record<'trade' | 'crossings' | 'travellers' | 'plates' | 'energy' | 'counties' | 'ownership', string>
  /** US$ by month; key `state|exp-or-imp|canada-or-world|naics`. */
  trade: { months: string[]; industries: Record<string, string>; series: Record<string, number[]> }
  /** Inbound counts by month; key `portCode|measure`. Months include the same months of earlier years for comparisons. */
  crossings: { months: string[]; lastMonth: string; ports: Record<string, { name: string; state: string }>; series: Record<string, Series> }
  /** Canadian residents returning from the U.S. by car, by B.C. port (key = StatCan member id). */
  travellers: { months: string[]; lastMonth: string; bcTotal: string; ports: Record<string, { name: string; facing: string; usPort: string }>; series: Record<string, Series> }
  /** Travellers in WA- and ID-plated vehicles entering B.C., summed from daily counts. */
  plates: { months: string[]; lastDay: string; series: Record<string, Series>; days: Record<string, number> }
  energy: {
    /** EIA pipeline imports from Canada (MMcf, $/Mcf) at Sumas and Eastport; CER figures for the same gas leaving B.C. */
    gas: {
      months: string[]; lastMonth: string; ports: Record<string, { name: string; state: string; bcPort: string }>
      mmcf: Record<string, Series>; price: Record<string, Series>; usTotalMmcf: number[]; cer: Record<string, { mmcf: Series; usd: Series }>
    }
    /** Crude oil imports run by Washington refineries, thousand barrels. */
    crude: { months: string[]; lastMonth: string; kbbl: { canada: Series; world: Series } }
    /** $/Mcf; key `state|citygate` or `state|residential`. */
    gasPrices: { months: string[]; series: Record<string, Series> }
    /** CER, key `state|fromCanada-or-toCanada|mwh-or-usd` (US$ at the dashboard's exchange rates). */
    electricity: { months: string[]; lastMonth: string; series: Record<string, Series> }
  }
  /** BLS QCEW, private jobs (third month of the quarter) and average weekly wage; key `fips|industry`. */
  counties: { quarters: string[]; counties: Record<string, { name: string; state: string }>; industries: Record<string, string>; jobs: Record<string, Series>; wages: Record<string, Series> }
  /** BEA 2024: Canadian-owned vs all foreign-owned (ppe in US$, jobs and mfgJobs in people). */
  ownership: { year: number; states: Record<string, Record<string, number | null>> }
}

export interface RegionalManifest {
  schemaVersion: number
  version: string
  generatedAt: string
  files: Record<string, string>
  quality: { passed: boolean; checks: { name: string; passed: boolean; detail: string }[] }
}

export interface RegionalBundle { manifest: RegionalManifest; dataset: RegionalDataset }

export async function loadRegional(signal?: AbortSignal): Promise<RegionalBundle> {
  const root = `${import.meta.env.BASE_URL}data/regional/`
  const manifest: RegionalManifest = await (await checkedResponse(`${root}latest.json`, signal)).json()
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{20}$/.test(manifest.version) || manifest.quality?.passed !== true
      || !manifest.quality.checks?.length || manifest.quality.checks.some((c) => c.passed !== true)) {
    throw new Error('This data version has not passed publication checks.')
  }
  const buffer = await (await checkedResponse(`${root}versions/${manifest.version}/dataset.json`, signal)).arrayBuffer()
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hash !== manifest.files['dataset.json']) throw new Error('Data checksum mismatch. Please reload to obtain a consistent version.')
  const dataset: RegionalDataset = JSON.parse(new TextDecoder().decode(buffer))
  if (dataset.schemaVersion !== 1 || !dataset.trade?.months?.length) throw new Error('The data contract does not match this page.')
  return { manifest, dataset }
}

/** Monthly US$ for one state, direction, partner and industry ('all' = every industry), aligned to `trade.months`. */
export function tradeSeries(d: RegionalDataset, state: string, flow: 'exp' | 'imp', partner: 'canada' | 'world', naics: string): number[] {
  const prefix = `${state}|${flow}|${partner}|`
  const keys = naics === 'all' ? Object.keys(d.trade.series).filter((k) => k.startsWith(prefix)) : [prefix + naics]
  return d.trade.months.map((_, i) => keys.reduce((sum, k) => sum + (d.trade.series[k]?.[i] ?? 0), 0))
}

/** Industries with any trade for this state and direction, largest first over the last 12 months. */
export function rankedIndustries(d: RegionalDataset, state: string, flow: 'exp' | 'imp', partner: 'canada' | 'world') {
  return Object.keys(d.trade.industries)
    .map((naics) => ({ naics, last12: tradeSeries(d, state, flow, partner, naics).slice(-12).reduce((a, v) => a + v, 0) }))
    .filter((x) => x.last12 > 0)
    .sort((a, b) => b.last12 - a.last12)
}

/** Value at `month` and at the same month `years` earlier, from a series aligned to `months`. */
export function compare(months: string[], series: Series | undefined, month: string, years = 2) {
  const then = `${Number(month.slice(0, 4)) - years}${month.slice(4)}`
  const at = (m: string) => (series && months.includes(m) ? series[months.indexOf(m)] ?? null : null)
  const now = at(month)
  const before = at(then)
  return { now, before, then, change: now !== null && before ? now / before - 1 : null }
}

/** The selected months of one industry as CSV (US$). */
export function tradeCsv(d: RegionalDataset, state: string, flow: 'exp' | 'imp', naics: string, count: number): string {
  const quote = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const canada = tradeSeries(d, state, flow, 'canada', naics)
  const world = tradeSeries(d, state, flow, 'world', naics)
  const label = naics === 'all' ? 'All industries' : `${naics} ${d.trade.industries[naics]}`
  const rows = d.trade.months.map((m, i) => [d.states[state], flow === 'exp' ? 'exports' : 'imports', label, m, canada[i], world[i],
    world[i] > 0 ? canada[i] / world[i] : null, d.sources.trade]).slice(-count)
  const header = ['state', 'direction', 'industry_naics', 'month', 'with_canada_usd', 'with_world_usd', 'canada_share', 'source']
  return '﻿' + [header, ...rows].map((r) => r.map(quote).join(',')).join('\r\n')
}
