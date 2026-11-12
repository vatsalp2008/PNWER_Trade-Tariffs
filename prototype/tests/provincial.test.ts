import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { monthlySelection, selectionCsv, type ProvincialDataset, type ProvincialManifest } from '../src/data/provincial.ts'

const root = new URL('../public/data/provincial/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('latest.json', root), 'utf8')) as ProvincialManifest
const bytes = readFileSync(new URL(`versions/${manifest.version}/dataset.json`, root))
const data = JSON.parse(bytes.toString()) as ProvincialDataset

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
