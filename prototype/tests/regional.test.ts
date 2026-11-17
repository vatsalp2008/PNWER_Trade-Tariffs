import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { compare, rankedIndustries, tradeCsv, tradeSeries, type RegionalDataset, type RegionalManifest } from '../src/data/regional.ts'
import type { RealData } from '../src/data/types.ts'

const root = new URL('../public/data/regional/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('latest.json', root), 'utf8')) as RegionalManifest
const bytes = readFileSync(new URL(`versions/${manifest.version}/dataset.json`, root))
const d = JSON.parse(bytes.toString()) as RegionalDataset
const real = JSON.parse(readFileSync(new URL('../src/data/real.json', import.meta.url), 'utf8')) as RealData
const heads = JSON.parse(readFileSync(new URL('../src/data/regional-headlines.json', import.meta.url), 'utf8')) as {
  version: string
  states: Record<string, { change: number; value: number; month: string; baseMonth: string; text: string }[]>
}

test('published manifest and checksum refer to one complete, checked version', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files['dataset.json'])
  assert.ok(manifest.quality.passed && manifest.quality.checks.every((c) => c.passed))
  assert.equal(heads.version, manifest.version, 'headlines come from the same version')
})

test('WA and ID trade with Canada matches the dashboard', (t) => {
  // If a source was down on the day the dashboard moved to a new month, the snapshot lags by a month.
  if (d.trade.months.at(-1) !== real.meta.dataAsOf) return t.skip('snapshot and dashboard cover different months')
  for (const st of ['WA', 'ID'] as const) {
    for (const [flow, field] of [['exp', 'exports'], ['imp', 'imports']] as const) {
      const ours = tradeSeries(d, st, flow, 'canada', 'all').slice(-12).reduce((a, v) => a + v, 0) / 1e6
      const dashboard = real.trade![st].all.last12[field]
      // Dashboard totals are stored to 3 significant figures.
      assert.ok(Math.abs(ours / dashboard - 1) < 0.006, `${st} ${field}: ${ours.toFixed(0)}M vs ${dashboard}M`)
    }
  }
})

test('industries add up to the all-industries series and rank largest first', () => {
  const all = tradeSeries(d, 'WA', 'imp', 'canada', 'all')
  const ranked = rankedIndustries(d, 'WA', 'imp', 'canada')
  const sum = ranked.reduce((a, x) => a + x.last12, 0)
  assert.ok(Math.abs(sum - all.slice(-12).reduce((a, v) => a + v, 0)) < 1)
  assert.ok(ranked.every((x, i) => i === 0 || ranked[i - 1].last12 >= x.last12))
})

test('headlines reproduce from the published records', () => {
  const t = d.travellers
  const wa = Object.keys(t.ports).filter((id) => t.ports[id].facing === 'WA')
  const now = wa.reduce((s, id) => s + (compare(t.months, t.series[id], t.lastMonth).now ?? 0), 0)
  const before = wa.reduce((s, id) => s + (compare(t.months, t.series[id], t.lastMonth).before ?? 0), 0)
  const h = heads.states.WA[0]
  assert.equal(h.value, now)
  assert.ok(Math.abs(h.change - (now / before - 1)) < 1e-4)
  assert.equal(h.month, t.lastMonth)
})

test('selected CSV has one row per month with Canada and world values', () => {
  const lines = tradeCsv(d, 'ID', 'exp', 'all', 12).replace('\uFEFF', '').trim().split('\r\n')
  assert.equal(lines.length, 13)
  assert.ok(lines[0].includes('with_canada_usd') && lines.at(-1)!.includes(d.trade.months.at(-1)!))
})

test('energy headlines reproduce from the published records', () => {
  const c = d.energy.crude
  const crude = heads.states.WA.find((h) => (h as { kind?: string }).kind === 'share') as unknown as { share: number; month: string }
  const last = c.months.length - 1
  assert.equal(crude.month, c.lastMonth)
  assert.ok(Math.abs(crude.share - c.kbbl.canada[last]! / c.kbbl.world[last]!) < 1e-4)
  const g = d.energy.gas
  const eastport = Object.keys(g.ports).find((k) => g.ports[k].state === 'ID')!
  const gas = heads.states.ID.find((h) => (h as { kind?: string }).kind === 'share') as unknown as { share: number }
  const sum12 = (s: (number | null)[]) => s.slice(-12).reduce<number>((a, v) => a + (v ?? 0), 0)
  assert.ok(Math.abs(gas.share - sum12(g.mmcf[eastport]) / sum12(g.usTotalMmcf)) < 1e-4)
})

test('border-county and ownership figures are internally consistent', () => {
  const c = d.counties
  for (const fips of Object.keys(c.counties)) {
    const total = c.jobs[`${fips}|10`]
    for (const ind of ['44-45', '721', '722']) {
      c.jobs[`${fips}|${ind}`].forEach((v, i) => assert.ok(v === null || total[i] === null || v <= total[i]!))
    }
  }
  for (const st of ['WA', 'ID']) {
    const o = d.ownership.states[st]
    assert.ok(o.ppeCanada! <= o.ppeAll! && o.jobsCanada! <= o.jobsAll!)
  }
})
