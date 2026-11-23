import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { corridorCsv, integration, sum12, type CorridorIndex, type CorridorManifest, type CorridorPair } from '../src/data/corridors.ts'
import type { RealData } from '../src/data/types.ts'

const root = new URL('../public/data/corridors/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('latest.json', root), 'utf8')) as CorridorManifest
const base = new URL(`versions/${manifest.version}/`, root)
const read = (name: string) => readFileSync(new URL(name, base))
const ix = JSON.parse(read('index.json').toString()) as CorridorIndex
const pair = (p: string, s: string) => JSON.parse(read(`pairs/${p}-${s}.json`).toString()) as CorridorPair
const real = JSON.parse(readFileSync(new URL('../src/data/real.json', import.meta.url), 'utf8')) as RealData

test('every published file matches its checksum and the checks passed', () => {
  for (const [name, hash] of Object.entries(manifest.files)) {
    assert.equal(createHash('sha256').update(read(name)).digest('hex'), hash, name)
  }
  assert.ok(manifest.quality.passed && manifest.quality.checks.every((c) => c.passed))
})

test("reproduces the team's cleaning notebook: 77,616 values and 7,542 zeros for B.C./Alberta with Washington/Idaho", () => {
  let values = 0
  let zeros = 0
  for (const p of ['BC', 'AB']) {
    for (const s of ['WA', 'ID']) {
      const ps = pair(p, s)
      for (const flow of ['exp', 'imp']) {
        const all = [ix.series[`${p}|${s}|${flow}|total`], ...Object.keys(ix.sections).filter((x) => x !== 'total').map((sec) => ps.series[`${p}|${s}|${flow}|${sec}`])]
        for (const series of all) {
          values += series.filter((v) => v !== null).length
          zeros += series.filter((v) => v === 0).length
        }
      }
    }
  }
  // The notebook covered 1990-01 to 2026-09; later months would add to the count.
  if (ix.lastMonth === '2026-09') {
    assert.equal(values, 77_616)
    assert.equal(zeros, 7_542)
  }
})

test('exchange rates from 2017 are the dashboard rates', () => {
  ix.months.forEach((m, i) => {
    if (real.meta.fx?.[m]) assert.ok(Math.abs(ix.fx[i] - real.meta.fx[m]) < 1e-6, m)
  })
})

test('integration scores recompute from the published sections', () => {
  const ps = pair('BC', 'WA')
  let num = 0
  let den = 0
  for (const sec of Object.keys(ix.sections).filter((x) => x !== 'total')) {
    const x = ps.series[`BC|WA|exp|${sec}`].slice(-12).reduce<number>((a, v) => a + (v ?? 0), 0)
    const m = ps.series[`BC|WA|imp|${sec}`].slice(-12).reduce<number>((a, v) => a + (v ?? 0), 0)
    num += Math.abs(x - m)
    den += x + m
  }
  assert.ok(Math.abs(ix.integration['BC-WA'].last12! - (1 - num / den)) < 1e-4)
  assert.equal(integration(50, 50), 1)
})

test('corridor CSV has every section, both ways, every month', () => {
  const lines = corridorCsv(ix, pair('AB', 'ID'), 'AB', 'ID').replace('﻿', '').trim().split('\r\n')
  assert.equal(lines.length, 1 + 2 * Object.keys(ix.sections).length * ix.months.length)
  assert.ok(sum12(ix, ix.series['BC|WA|exp|total'])! > 0)
})

test('each alert’s context names the products behind it, and they add up', () => {
  for (const a of ix.alerts.items) {
    const c = a.context
    if (!c) continue // the customs files couldn't be read that day; the alert goes out without it
    assert.ok(['shift', 'real', 'small'].includes(c.reading), a.pair)
    assert.ok(c.products.length >= 1 && c.products.length <= 3, a.pair)
    for (const p of c.products) {
      // The corridor is part of all U.S. states, which is part of all countries (thousands of C$, rounded).
      assert.ok(p.corridorNowCad <= p.usNowCad + 1 && p.usNowCad <= p.allNowCad + 1, `${a.pair} ${p.hs4}`)
      assert.ok(p.corridorBeforeCad <= p.usBeforeCad + 1 && p.usBeforeCad <= p.allBeforeCad + 1, `${a.pair} ${p.hs4}`)
    }
    // The products' move (customs files) explains the alert's move (table 12-10-0099): same direction, similar size.
    const moved = c.products.reduce((x, p) => x + p.corridorNowCad - p.corridorBeforeCad, 0)
    const share = moved / (a.nowCad - a.beforeCad)
    assert.ok(share > 0.5 && share < 1.5, `${a.pair} ${a.section}: products explain ${share.toFixed(2)} of the move`)
  }
})
