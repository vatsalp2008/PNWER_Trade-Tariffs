import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { cadToUsdM, monthlySelection, selectionCsv, type ProvincialDataset, type ProvincialManifest } from '../src/data/provincial.ts'
import type { RealData } from '../src/data/types.ts'

const root = new URL('../public/data/provincial/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('latest.json', root), 'utf8')) as ProvincialManifest
const bytes = readFileSync(new URL(`versions/${manifest.version}/dataset.json`, root))
const data = JSON.parse(bytes.toString()) as ProvincialDataset
const real = JSON.parse(readFileSync(new URL('../src/data/real.json', import.meta.url), 'utf8')) as RealData
const fx = real.meta.fx ?? {}
/** The page shows the dashboard's latest month (or the snapshot's, if that is earlier). */
const through = data.lastMonth < real.meta.dataAsOf ? data.lastMonth : real.meta.dataAsOf

test('published manifest, observation table and checksum refer to one complete version', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.files['dataset.json'])
  assert.equal(data.rows.length, manifest.observationCount)
  assert.equal(data.lastMonth, manifest.lastMonth)
  assert.ok(manifest.quality.checks.every((c) => c.passed))
  const csv = readFileSync(fileURLToPath(new URL(`versions/${manifest.version}/observations.csv`, root)))
  assert.equal(createHash('sha256').update(csv).digest('hex'), manifest.files['observations.csv'])
})

test('province, product and time filters isolate the requested records', () => {
  const rows = monthlySelection(data, 'AB', 'energy', 12)
  assert.equal(rows.length, 12)
  assert.ok(rows.every((r) => r.province === 'AB' && r.product === 'energy' && r.partner === 'us'))
  assert.equal(rows.at(-1)!.month, data.lastMonth)
  assert.ok(rows.every((r) => r.worldCad !== null && r.worldCad >= r.valueCad))
})

test('every insight matches the selected records and last-year baseline', () => {
  for (const s of data.summaries) {
    const rows = monthlySelection(data, s.province, s.product, 36)
    const latest = rows.at(-1)!
    const prior = rows.find((r) => r.month === `${Number(latest.month.slice(0, 4)) - 1}${latest.month.slice(4)}`)
    assert.equal(latest.valueCad, s.usCad)
    assert.equal(latest.worldCad, s.worldCad)
    assert.equal(s.usShare, s.worldCad > 0 ? s.usCad / s.worldCad : null)
    assert.equal(s.yoy, prior && prior.valueCad > 0 ? s.usCad / prior.valueCad - 1 : null)
  }
})

test('selected CSV exports all selected months and retains original source identity', () => {
  const csv = selectionCsv(data, 'BC', 'forestry', 24)
  const lines = csv.trim().split('\r\n')
  assert.equal(lines.length, 25)
  assert.ok(lines[0].includes('us_exports_cad'))
  assert.ok(lines.slice(1).every((line) => line.includes('British Columbia') && line.includes(data.source)))
  assert.ok(lines.at(-1)!.includes(data.lastMonth))
})

test('US$ figures use the dashboard exchange rates, and all-goods totals match the dashboard', (t) => {
  assert.ok(Object.keys(fx).length > 0, 'real.json carries the monthly exchange rates')
  if (through !== real.meta.dataAsOf) return t.skip('snapshot does not reach the dashboard month yet')
  for (const prov of ['BC', 'AB'] as const) {
    const rows = monthlySelection(data, prov, 'all', 12, through)
    assert.equal(rows.length, 12)
    const ours = rows.reduce((sum, r) => sum + cadToUsdM(r.valueCad, r.month, fx)!, 0)
    const dashboard = real.trade![prov].all.last12.exports
    // Dashboard totals are stored to 3 significant figures; the build checks the unrounded values to 0.5%.
    assert.ok(Math.abs(ours / dashboard - 1) < 0.01, `${prov}: ${ours.toFixed(0)}M vs dashboard ${dashboard}M`)
  }
})

test('selected CSV adds US$ columns at the same rates when asked', () => {
  const csv = selectionCsv(data, 'AB', 'all', 12, { fx, through })
  const [header, ...lines] = csv.replace('\uFEFF', '').trim().split('\r\n')
  assert.ok(header.includes('cad_per_usd') && header.includes('us_exports_usd'))
  const cols = header.split(',').map((c) => c.replaceAll('"', ''))
  for (const line of lines) {
    const cells = line.slice(1, -1).split('","')
    const cad = Number(cells[cols.indexOf('us_exports_cad')])
    const rate = Number(cells[cols.indexOf('cad_per_usd')])
    assert.ok(Math.abs(Number(cells[cols.indexOf('us_exports_usd')]) - cad / rate) < 1)
  }
})
