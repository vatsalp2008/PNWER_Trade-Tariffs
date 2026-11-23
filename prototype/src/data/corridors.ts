/** Cross-border corridors (pipeline/corridors.py): province/territory <-> U.S. state trade by HS section since 1990. */
import { checkedResponse } from './provincial'

type Series = (number | null)[]

export interface CorridorIndex {
  schemaVersion: number
  months: string[]
  lastMonth: string
  /** Canadian dollars per U.S. dollar, aligned to `months`. */
  fx: number[]
  provinces: Record<string, string>
  states: Record<string, string>
  sections: Record<string, string>
  /** Thousands of C$. Keys: `P|S|exp|total`, `P|S|imp|total`, `P|US|exp|total`, `P|WORLD|exp|total`, `CA|S|flow|total`. */
  series: Record<string, Series>
  /** Share of trade that is the same products going both ways (Grubel–Lloyd), last 12 months and by calendar year. */
  integration: Record<string, { last12: number | null; byYear: Record<string, number | null> }>
  mirror: { state: string; name: string; canadaExportsToState: number; stateImportsFromCanada: number; canadaImportsFromState: number; stateExportsToCanada: number }[]
  sources: string[]
  /** Tariff impact tracker: per corridor, each targeted action's indicative effect (see pipeline/corridors.py). */
  impacts: Record<string, TariffImpact[]>
  /** HS sections hit by each targeted action, from the site's business tags. */
  eventSections: Record<string, string[]>
  /** Unusual moves this month (last 3 months vs a year earlier, beyond 2.5 standard deviations of the series' history). */
  alerts: {
    month: string
    rule: string
    items: { pair: string; flow: 'exp' | 'imp'; section: string; month: string; nowCad: number; beforeCad: number; change: number; z: number; context?: AlertContext }[]
    backtest: Record<string, number>
  }
}

/**
 * What explains an alert: the products behind most of the move, and the province's trade in them with all U.S. states
 * and all countries over the same months (thousands of C$, from the customs files). "shift": that total barely moved, so
 * the move was mostly trade switching routes or partners; "real": it moved the same way; "small": the move is small
 * next to it. See alert_context() in pipeline/corridors.py.
 */
export interface AlertContext {
  products: { hs4: string; name: string; corridorNowCad: number; corridorBeforeCad: number; usNowCad: number; usBeforeCad: number; allNowCad: number; allBeforeCad: number }[]
  reading: 'shift' | 'real' | 'small'
}

export interface TariffImpact {
  id: string
  date: string
  measure: string
  imposedBy: 'US' | 'CA'
  /** "exp": the province's exports to the state (U.S. tariffs); "imp": its imports from the state (Canadian tariffs). */
  flow: 'exp' | 'imp'
  sections: string[]
  monthsAfter: number
  baseCad: number
  hitChange: number
  otherChange: number
  effect: number
  low: number | null
  high: number | null
  preTrend: number | null
}

export interface CorridorPair { schemaVersion: number; pair: string; series: Record<string, Series> }

export interface CorridorManifest {
  schemaVersion: number
  version: string
  generatedAt: string
  files: Record<string, string>
  quality: { passed: boolean; checks: { name: string; passed: boolean; detail: string }[] }
}

export interface CorridorBundle { manifest: CorridorManifest; index: CorridorIndex; base: string }

async function verified(url: string, expected: string | undefined, signal?: AbortSignal) {
  const buffer = await (await checkedResponse(url, signal)).arrayBuffer()
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (!expected || hash !== expected) throw new Error('Data checksum mismatch. Please reload to obtain a consistent version.')
  return JSON.parse(new TextDecoder().decode(buffer))
}

export async function loadCorridors(signal?: AbortSignal): Promise<CorridorBundle> {
  const root = `${import.meta.env.BASE_URL}data/corridors/`
  const manifest: CorridorManifest = await (await checkedResponse(`${root}latest.json`, signal)).json()
  if (manifest.schemaVersion !== 1 || !/^[a-f0-9]{20}$/.test(manifest.version) || manifest.quality?.passed !== true
      || !manifest.quality.checks?.length || manifest.quality.checks.some((c) => c.passed !== true)) {
    throw new Error('This data version has not passed publication checks.')
  }
  const base = `${root}versions/${manifest.version}/`
  const index: CorridorIndex = await verified(`${base}index.json`, manifest.files['index.json'], signal)
  if (index.schemaVersion !== 1 || index.fx.length !== index.months.length) throw new Error('The data contract does not match this page.')
  return { manifest, index, base }
}

export async function loadPair(b: CorridorBundle, pair: string, signal?: AbortSignal): Promise<CorridorPair> {
  return verified(`${b.base}pairs/${pair}.json`, b.manifest.files[`pairs/${pair}.json`], signal)
}

/** One month's value in US$ millions (C$ thousands at that month's rate). */
export const usdAt = (ix: CorridorIndex, values: Series | undefined, i: number): number | null =>
  values?.[i] == null ? null : (values[i] as number) * 1000 / ix.fx[i] / 1e6

/** US$ millions over the 12 months ending at index `end` (null if any month is missing). */
export function sum12(ix: CorridorIndex, values: Series | undefined, end = ix.months.length - 1): number | null {
  if (!values || end < 11) return null
  let total = 0
  for (let i = end - 11; i <= end; i++) {
    const v = usdAt(ix, values, i)
    if (v === null) return null
    total += v
  }
  return total
}

/** Grubel–Lloyd integration: 1 − |X − M| / (X + M). */
export const integration = (x: number, m: number): number | null => (x + m > 0 ? 1 - Math.abs(x - m) / (x + m) : null)

/** The selected corridor's months as CSV: original C$ (thousands), the exchange rate and US$. */
export function corridorCsv(ix: CorridorIndex, pair: CorridorPair, p: string, s: string): string {
  const quote = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const header = ['province', 'state', 'direction', 'hs_section', 'month', 'value_cad_thousands', 'cad_per_usd', 'value_usd']
  const rows: unknown[][] = []
  for (const flow of ['exp', 'imp'] as const) {
    for (const sec of Object.keys(ix.sections)) {
      const values = sec === 'total' ? ix.series[`${p}|${s}|${flow}|total`] : pair.series[`${p}|${s}|${flow}|${sec}`]
      ix.months.forEach((m, i) => {
        const v = values?.[i]
        rows.push([ix.provinces[p], ix.states[s], flow === 'exp' ? `${p} exports to ${s}` : `${p} imports from ${s}`,
          `${sec} ${ix.sections[sec]}`, m, v, ix.fx[i], v == null ? null : Math.round((v * 1000) / ix.fx[i])])
      })
    }
  }
  return '﻿' + [header, ...rows].map((r) => r.map(quote).join(',')).join('\r\n')
}
