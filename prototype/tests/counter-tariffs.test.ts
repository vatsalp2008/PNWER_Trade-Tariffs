import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { CounterTariffs } from '../src/data/index.ts'
import type { RealData } from '../src/data/types.ts'

const read = (name: string) => JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'))
const ct = read('counter-tariffs.json') as CounterTariffs
const real = read('real.json') as RealData
const lists = read('canada-countermeasures.json') as { measures: { id: string; groups: { rate: number; items: string[] }[] }[] }
const events = read('tariff-events.json') as { events: { id: string }[] }
const PLACES = ['WA', 'OR', 'ID', 'MT', 'AK', 'BC', 'AB', 'SK', 'YT', 'NT']

test('the estimate passed its checks and uses the dashboard’s 12 months', () => {
  assert.ok(ct.checks.length >= 4 && ct.checks.every((c) => c.passed))
  assert.equal(ct.window[1], real.meta.dataAsOf)
})

test('every place and every dashboard scope has a cost, and the numbers are consistent', () => {
  const scopes = Object.keys(real.affordability!.WA)
  for (const j of PLACES) {
    const place = ct.jurisdictions[j]
    assert.ok(place, j)
    for (const s of scopes) {
      const c = place.scopes[s]
      assert.ok(c, `${j}/${s}`)
      // 3 significant figures, so allow rounding.
      assert.ok(c.duties <= c.covered * 0.5 * 1.01 + 0.001, `${j}/${s}: surtax above 50% of the goods`)
      assert.ok(c.covered <= c.trade * 1.01 + 0.001, `${j}/${s}: listed goods above all goods`)
      assert.ok(c.duties <= place.scopes.all.duties * 1.01 + 0.001, `${j}/${s}: a scope above the total`)
    }
    const parts = Object.values(place.byPartner).reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(parts - place.scopes.all.duties) <= place.scopes.all.duties * 0.02 + 0.01, `${j}: partners add up to the total`)
  }
})

test('each measure links to a timeline event and its item list matches the curated file', () => {
  const ids = new Set(events.events.map((e) => e.id))
  for (const m of ct.measures) {
    assert.ok(ids.has(m.id), `${m.id} is on the timeline`)
    const src = lists.measures.find((x) => x.id === m.id)!
    assert.equal(m.items, src.groups.reduce((a, g) => a + g.items.length, 0))
    assert.deepEqual(m.rates, [...new Set(src.groups.map((g) => g.rate))].sort())
  }
})
