import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { corridorCsv, integration, loadCorridors, loadPair, sum12, type CorridorBundle, type CorridorIndex, type CorridorPair } from '../data/corridors'
import { monthLabel, NOT_AVAILABLE, pct, signedPct, usd } from '../lib/format'
import { BRAND_100, BRAND_700, CLAY_100, MUTED, OCHRE, STONE } from '../lib/palette'

const month = (ym: string) => monthLabel(`${ym}-01`)
const changeCell = (c: number | null) => (c === null ? NOT_AVAILABLE : <span className={c < 0 ? 'down' : 'up'}>{signedPct(c, 0)}</span>)
const ratio = (a: number | null, b: number | null) => (a === null || !b ? null : a / b - 1)
/** A % change only means something from a big enough starting value (US$ millions); otherwise say so. */
const changeFrom = (now: number | null, before: number | null, min: number) =>
  before !== null && before < min ? <span className="muted-dash" title={`Starting value under US$${min}M`}>small base</span> : changeCell(ratio(now, before))
/** Eras shaded on the long-run chart (first month of each). */
const ERAS = [
  { from: '1990-01', to: '1993-12', label: 'Before NAFTA', fill: STONE },
  { from: '1994-01', to: '2020-06', label: 'NAFTA', fill: '#eef2f3' },
  { from: '2020-07', to: '2025-02', label: 'USMCA', fill: BRAND_100 },
  { from: '2025-03', to: '9999-12', label: 'Tariff era', fill: CLAY_100 },
]

/** The Corridors tab of the Data & verification page: trade between each PNWER province/territory and state. */
export function Corridors() {
  const [bundle, setBundle] = useState<CorridorBundle | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    loadCorridors(controller.signal).then(setBundle).catch((e: Error) => {
      if (!controller.signal.aborted) setError(e.message)
    })
    return () => controller.abort()
  }, [attempt])
  return (
    <>
      <p className="intro">
        Trade between each PNWER province or territory and each PNWER state, both ways, every month since 1990, by product
        section. Amounts are in <strong>U.S. dollars (US$)</strong> at monthly exchange rates. Built on the project team’s cleaning of
        Statistics Canada table 12-10-0099.
      </p>
      {!bundle && !error && <p role="status">Loading the verified data snapshot…</p>}
      {error && (
        <section className="card" role="alert">
          <h2>Data could not be loaded</h2>
          <p>{error}</p>
          <button className="btn-primary" onClick={() => { setError(''); setAttempt(attempt + 1) }}>Retry</button>
        </section>
      )}
      {bundle && <CorridorExplorer bundle={bundle} />}
    </>
  )
}

function CorridorExplorer({ bundle }: { bundle: CorridorBundle }) {
  const { index: ix, manifest } = bundle
  const [params, setParams] = useSearchParams()
  const [p0, s0] = (params.get('pair') ?? 'BC-WA').split('-')
  const p = Object.hasOwn(ix.provinces, p0) ? p0 : 'BC'
  const s = Object.hasOwn(ix.states, s0) ? s0 : 'WA'
  const key = `${p}-${s}`
  const [pair, setPair] = useState<CorridorPair | null>(null)
  const [pairError, setPairError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    loadPair(bundle, key, controller.signal).then(setPair).catch((e: Error) => {
      if (!controller.signal.aborted) setPairError(e.message)
    })
    return () => controller.abort()
  }, [bundle, key])
  const choose = (np: string, ns: string) => {
    const next = new URLSearchParams(params)
    next.set('pair', `${np}-${ns}`)
    setPair(null)
    setPairError('')
    setParams(next)
  }

  const last = ix.months.length - 1
  const twoYears = last - 24
  const exp = ix.series[`${p}|${s}|exp|total`]
  const imp = ix.series[`${p}|${s}|imp|total`]
  const exp12 = sum12(ix, exp)
  const imp12 = sum12(ix, imp)
  const usAll = sum12(ix, ix.series[`${p}|US|exp|total`])
  const g = ix.integration[key]
  const then = month(ix.months[twoYears])
  const range = `12 months to ${month(ix.lastMonth)}`
  const download = () => {
    if (!pair) return
    const url = URL.createObjectURL(new Blob([corridorCsv(ix, pair, p, s)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `corridor-${key}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <p className="mode-note">
        Source: Statistics Canada table 12-10-0099 · data through {month(ix.lastMonth)} · <strong>{manifest.quality.checks.length} automated checks passed</strong>
      </p>
      <Alerts ix={ix} onPick={choose} />
      <Overview ix={ix} current={key} onPick={choose} />
      <div className="controls">
        <label>
          <span>Province or territory</span>
          <select value={p} onChange={(e) => choose(e.target.value, s)}>
            {Object.entries(ix.provinces).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label>
          <span>State</span>
          <select value={s} onChange={(e) => choose(p, e.target.value)}>
            {Object.entries(ix.states).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
      </div>

      {(exp12 ?? 0) + (imp12 ?? 0) >= 250 && (
        <p><Link className="btn-primary" to={`/corridor/${p}/${s}`}>Open 2-page corridor fact sheet</Link></p>
      )}
      <div className="prov-stats">
        <div className="stat">
          <div className="stat-label">{ix.provinces[p]} → {ix.states[s]}, {range}</div>
          <div className="stat-value">{exp12 === null ? NOT_AVAILABLE : usd(exp12)}</div>
          <div className="stat-note">vs 12 months to {then}: {changeCell(ratio(exp12, sum12(ix, exp, twoYears)))}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{ix.states[s]} → {ix.provinces[p]}, {range}</div>
          <div className="stat-value">{imp12 === null ? NOT_AVAILABLE : usd(imp12)}</div>
          <div className="stat-note">vs 12 months to {then}: {changeCell(ratio(imp12, sum12(ix, imp, twoYears)))}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Supply-chain integration score</div>
          <div className="stat-value">{g?.last12 == null ? NOT_AVAILABLE : g.last12.toFixed(2)}</div>
          <div className="stat-note">0 = trade goes one way only; 1 = the same products flow equally both ways</div>
        </div>
        <div className="stat">
          <div className="stat-label">{ix.states[s]}’s share of {ix.provinces[p]}’s exports to the U.S.</div>
          <div className="stat-value">{exp12 === null || !usAll ? NOT_AVAILABLE : pct(exp12 / usAll, 1)}</div>
          <div className="stat-note">{range}</div>
        </div>
      </div>

      <div className="dash-grid">
        <ChartCard title={`${ix.provinces[p]} ↔ ${ix.states[s]} since 1990`} subtitle="12-month totals each way, US$, not adjusted for inflation. Shaded: before NAFTA, NAFTA, USMCA, tariff era."
          source="Adapted from Statistics Canada, table 12-10-0099-01" exportName={`corridor-${key}-since-1990`}>
          <LongRun ix={ix} exp={exp} imp={imp} />
        </ChartCard>
        <ChartCard title="Integration score by year" subtitle="Share of the corridor’s trade that is the same product sections going both ways. Higher = more shared supply chains, so tariffs can hit goods more than once."
          source="Calculated from Statistics Canada, table 12-10-0099-01">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={Object.entries(g?.byYear ?? {}).map(([y, v]) => ({ y, v }))} margin={{ top: 12, right: 16, bottom: 12, left: 4 }}>
              <CartesianGrid stroke={STONE} vertical={false} />
              <XAxis dataKey="y" minTickGap={32} tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis domain={[0, 1]} tickFormatter={(v) => Number(v).toFixed(1)} width={36} tick={{ fill: MUTED, fontSize: 11 }} />
              <Tooltip formatter={(v) => [Number(v).toFixed(2), 'Integration score']} />
              <Line dataKey="v" stroke={BRAND_700} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title={`What crosses between ${ix.provinces[p]} and ${ix.states[s]} · ${range}`}
        subtitle={`By HS product section, US$. Change compares with the 12 months to ${then}. The integration score per section is 1 when the same section flows equally both ways.`}
        source="Adapted from Statistics Canada, table 12-10-0099-01">
        {pairError && <p role="alert">{pairError}</p>}
        {!pair && !pairError && <p role="status">Loading sections…</p>}
        {pair && <Sections ix={ix} pair={pair} p={p} s={s} twoYears={twoYears} />}
        {pair && <div className="prov-downloads"><button className="tab" onClick={download}>Download this corridor (CSV, C$ and US$)</button></div>}
      </ChartCard>

      <Impacts ix={ix} p={p} s={s} />

      <WhereExportsGo ix={ix} p={p} />

      <details className="card prov-quality">
        <summary>Sources, checks and research limitations</summary>
        <ol>{manifest.quality.checks.map((c) => <li key={c.name}><strong>Passed: {c.name}.</strong> {c.detail}</li>)}</ol>
        <h2>Canada’s records vs U.S. records, 12 months to {month(ix.lastMonth)} (US$ millions)</h2>
        <div className="prov-table-wrap">
          <table className="prov-table">
            <thead><tr><th>State</th><th>Canada’s exports to the state</th><th>State’s imports from Canada (U.S. record)</th><th>Canada’s imports from the state</th><th>State’s exports to Canada (U.S. record)</th></tr></thead>
            <tbody>
              {ix.mirror.map((m) => (
                <tr key={m.state}><td>{m.name}</td><td>{m.canadaExportsToState.toLocaleString()}</td><td>{m.stateImportsFromCanada.toLocaleString()}</td>
                  <td>{m.canadaImportsFromState.toLocaleString()}</td><td>{m.stateExportsToCanada.toLocaleString()}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="micro">The two countries record the same shipments differently (re-exports, where goods are counted, timing), so these differ somewhat. Canada’s imports and the U.S. record of exports to Canada should be close, because the U.S. uses Canada’s import records.</p>
        <h2>Review notes</h2>
        <ul>
          <li>Canadian exports are “domestic exports” (goods grown or made in the province); imports are all imports cleared in the province.</li>
          <li>The state is the declared destination or origin, not necessarily where goods are used. Values are nominal; long-run changes include inflation.</li>
          <li>HS sections are broad, so the integration score reads higher than it would for individual products.</li>
          <li>Exchange rates: Bank of Canada monthly averages from 2017 (the dashboard’s rates); U.S. Federal Reserve monthly averages for 1990–2016.</li>
        </ul>
        <ul>{ix.sources.map((x) => <li key={x}>{x}</li>)}</ul>
        <p>Version: <code>{manifest.version}</code>. Snapshot published: {manifest.generatedAt}.</p>
      </details>
    </>
  )
}

/** This month's unusual moves across all corridors (see the rule under the list). */
function Alerts({ ix, onPick }: { ix: CorridorIndex; onPick: (p: string, s: string) => void }) {
  const a = ix.alerts
  if (!a) return null
  const i = ix.months.length - 1
  const usdM = (cad: number) => (cad * 1000) / ix.fx[i] / 1e6
  const end = ix.months.indexOf(a.month)
  const span = `${month(ix.months[end - 2])}–${month(a.month)}`
  return (
    <ChartCard title={`Unusual moves · ${span}`} subtitle="Corridor product flows that changed far more than usual compared with the same 3 months a year earlier.">
      {a.items.length ? (
        <ul className="alert-list">
          {a.items.map((x) => {
            const [p, s] = x.pair.split('-')
            const way = x.flow === 'exp' ? `${ix.provinces[p]} → ${ix.states[s]}` : `${ix.states[s]} → ${ix.provinces[p]}`
            return (
              <li key={`${x.pair}-${x.flow}-${x.section}`}>
                <strong className={x.change < 0 ? 'down' : 'up'}>{signedPct(x.change, 0)}</strong>
                <span>
                  <button type="button" className="link-button" onClick={() => onPick(p, s)}>{way}</button> · {ix.sections[x.section]}:{' '}
                  {usd(usdM(x.beforeCad))} → {usd(usdM(x.nowCad))} over 3 months ({Math.abs(x.z).toFixed(1)} times its usual swing)
                </span>
              </li>
            )
          })}
        </ul>
      ) : <p className="micro">Nothing unusual this month.</p>}
      <p className="micro">Rule: {a.rule}. At most 5 shown. A flag is a prompt to look closer (news, tariff actions, one-off shipments), not a conclusion.</p>
    </ChartCard>
  )
}

/** All 25 corridors ranked by two-way trade; click one to select it. */
function Overview({ ix, current, onPick }: { ix: CorridorIndex; current: string; onPick: (p: string, s: string) => void }) {
  const last = ix.months.length - 1
  const rows = Object.keys(ix.provinces).flatMap((p) => Object.keys(ix.states).map((s) => {
    const two = (end: number) => {
      const a = sum12(ix, ix.series[`${p}|${s}|exp|total`], end)
      const b = sum12(ix, ix.series[`${p}|${s}|imp|total`], end)
      return a === null || b === null ? null : a + b
    }
    return { p, s, now: two(last), before: two(last - 24), g: ix.integration[`${p}-${s}`]?.last12 ?? null }
  })).filter((r) => (r.now ?? 0) >= 1).sort((a, b) => (b.now ?? 0) - (a.now ?? 0))
  return (
    <ChartCard title={`All PNWER corridors · 12 months to ${month(ix.lastMonth)}`} subtitle="Two-way trade between each province or territory and each state (corridors under US$1M left out). Select one to explore it.">
      <div className="prov-table-wrap">
        <table className="prov-table corridor-table">
          <thead><tr><th>Corridor</th><th>Two-way trade</th><th>vs two years earlier</th><th>Integration score</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.p}-${r.s}`} className={`${r.p}-${r.s}` === current ? 'is-highlight' : ''}>
                <td><button type="button" className="link-button" onClick={() => onPick(r.p, r.s)}>{ix.provinces[r.p]} ↔ {ix.states[r.s]}</button></td>
                <td>{r.now === null ? NOT_AVAILABLE : usd(r.now)}</td>
                <td>{changeFrom(r.now, r.before, 10)}</td>
                <td>{r.g === null ? NOT_AVAILABLE : r.g.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}

function LongRun({ ix, exp, imp }: { ix: CorridorIndex; exp: (number | null)[]; imp: (number | null)[] }) {
  const data = ix.months.map((m, i) => ({ m, exp: i >= 11 ? sum12(ix, exp, i) : null, imp: i >= 11 ? sum12(ix, imp, i) : null })).filter((d) => d.m >= '1990-12')
  const lastM = ix.months[ix.months.length - 1]
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 12, left: 4 }}>
        {ERAS.map((e) => (
          <ReferenceArea key={e.label} x1={e.from < data[0].m ? data[0].m : e.from} x2={e.to > lastM ? lastM : e.to} fill={e.fill} fillOpacity={1} ifOverflow="hidden" />
        ))}
        <CartesianGrid stroke="#ffffff" strokeOpacity={0.9} vertical={false} />
        <XAxis dataKey="m" tickFormatter={(m) => String(m).slice(0, 4)} minTickGap={40} tick={{ fill: MUTED, fontSize: 11 }} />
        <YAxis tickFormatter={(v) => usd(Number(v))} width={70} tick={{ fill: MUTED, fontSize: 11 }} />
        <Tooltip labelFormatter={(m) => `12 months to ${month(String(m))}`} formatter={(v, name) => [usd(Number(v)), name === 'exp' ? 'Province → state' : 'State → province']} />
        <Legend formatter={(name) => (name === 'exp' ? 'Province → state' : 'State → province')} wrapperStyle={{ fontSize: 11 }} />
        <Line dataKey="exp" stroke={BRAND_700} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="imp" stroke={OCHRE} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function Sections({ ix, pair, p, s, twoYears }: { ix: CorridorIndex; pair: CorridorPair; p: string; s: string; twoYears: number }) {
  const rows = Object.entries(ix.sections).filter(([sec]) => sec !== 'total').map(([sec, label]) => {
    const x = sum12(ix, pair.series[`${p}|${s}|exp|${sec}`]) ?? 0
    const m = sum12(ix, pair.series[`${p}|${s}|imp|${sec}`]) ?? 0
    const before = (sum12(ix, pair.series[`${p}|${s}|exp|${sec}`], twoYears) ?? 0) + (sum12(ix, pair.series[`${p}|${s}|imp|${sec}`], twoYears) ?? 0)
    return { sec, label, x, m, before, g: integration(x, m) }
  }).filter((r) => r.x + r.m >= 0.05).sort((a, b) => b.x + b.m - (a.x + a.m))
  return (
    <div className="prov-table-wrap">
      <table className="prov-table">
        <thead><tr><th>Section</th><th>{p} → {s}</th><th>{s} → {p}</th><th>Two-way change</th><th>Integration</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sec}><td>{r.sec} · {r.label}</td><td>{usd(r.x)}</td><td>{usd(r.m)}</td><td>{changeFrom(r.x + r.m, r.before, 5)}</td><td>{r.g === null ? NOT_AVAILABLE : r.g.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Did each targeted tariff action change this corridor's trade, compared with the corridor's other trade? */
function Impacts({ ix, p, s }: { ix: CorridorIndex; p: string; s: string }) {
  const rows = ix.impacts?.[`${p}-${s}`] ?? []
  if (!rows.length) return null
  return (
    <ChartCard title={`Did tariff actions change ${ix.provinces[p]} ↔ ${ix.states[s]} trade?`}
      subtitle="For each targeted action: the product sections it hit vs the corridor’s other trade (energy left out, since it moves with oil prices), each compared with the same months a year earlier. The difference is an indicative effect, not proof."
      source="Calculated from Statistics Canada, table 12-10-0099-01, and the site’s tariff timeline">
      <div className="prov-table-wrap">
        <table className="prov-table impact-table">
          <thead><tr><th>Action</th><th>Trade it hit</th><th>Hit sections</th><th>Other trade</th><th>Indicative effect</th><th>Before the action</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const caution = r.preTrend !== null && Math.abs(r.preTrend) > 0.1
              return (
                <tr key={r.id}>
                  <td>{monthLabel(r.date)} · {r.measure}</td>
                  <td>{r.flow === 'exp' ? `${p} → ${s}` : `${s} → ${p}`} · {r.sections.join(', ')}{r.sections.includes('XVII') ? '*' : ''}</td>
                  <td>{changeCell(r.hitChange)}</td>
                  <td>{changeCell(r.otherChange)}</td>
                  <td><strong>{changeCell(r.effect)}</strong>{r.low !== null && r.high !== null && <span className="dd-note"> typical month {signedPct(r.low, 0)} to {signedPct(r.high, 0)}</span>}</td>
                  <td>{r.preTrend === null ? NOT_AVAILABLE : caution
                    ? <span className="caution" title="The hit sections were already moving differently before the action, so the effect may not be the action's.">{signedPct(r.preTrend, 0)} · read with care</span>
                    : signedPct(r.preTrend, 0)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="micro">
        Up to 12 months after each action ({rows[0].monthsAfter < 12 ? 'fewer for recent actions' : '12 months'}). “Before the action” runs the same comparison for the 12 months before it: near 0% means the two groups were moving together, so a gap afterwards is more likely the action’s effect. Actions overlap (e.g. two lumber measures in 2025), and HS sections are broad. *Section XVII also covers aircraft and ships, not just cars.
      </p>
    </ChartCard>
  )
}

/** Where the province's exports go: the selected state, other PNWER states, the rest of the U.S., the rest of the world. */
function WhereExportsGo({ ix, p }: { ix: CorridorIndex; p: string }) {
  const last = ix.months.length - 1
  const world = sum12(ix, ix.series[`${p}|WORLD|exp|total`])
  const us = sum12(ix, ix.series[`${p}|US|exp|total`])
  const pnwer = Object.keys(ix.states).reduce((a, st) => a + (sum12(ix, ix.series[`${p}|${st}|exp|total`]) ?? 0), 0)
  const byYear = [...new Set(ix.months.map((m) => m.slice(0, 4)))].filter((y) => ix.months.includes(`${y}-12`) && y >= '1997').map((y) => {
    const end = ix.months.indexOf(`${y}-12`)
    const w = sum12(ix, ix.series[`${p}|WORLD|exp|total`], end)
    const u = sum12(ix, ix.series[`${p}|US|exp|total`], end)
    const n = Object.keys(ix.states).reduce((a, st) => a + (sum12(ix, ix.series[`${p}|${st}|exp|total`], end) ?? 0), 0)
    return { y, us: w && u !== null ? u / w : null, pnwer: w ? n / w : null }
  })
  const rows = world && us !== null ? [
    ['PNWER states (WA, OR, ID, MT, AK)', pnwer],
    ['Rest of the U.S.', us - pnwer],
    ['Rest of the world', world - us],
  ] as const : []
  return (
    <div className="dash-grid">
      <ChartCard title={`Where ${ix.provinces[p]}’s exports go · 12 months to ${month(ix.months[last])}`}
        subtitle="Domestic exports. PNWER states are the five U.S. members of PNWER." source="Adapted from Statistics Canada, tables 12-10-0099-01 and 12-10-0175-01">
        {rows.length ? (
          <ul className="prov-ranking">
            {rows.map(([label, v]) => (
              <li key={label}><button type="button" disabled>
                <span>{label}</span><strong>{usd(v)} · {pct(v / world!)}</strong>
                <span className="prov-bar"><span style={{ width: `${(100 * v) / world!}%` }} /></span>
              </button></li>
            ))}
          </ul>
        ) : <p>{NOT_AVAILABLE}</p>}
      </ChartCard>
      <ChartCard title="Share of exports going to the U.S. and to PNWER states" subtitle="Calendar years since 1997 (the first year with world totals)." source="Adapted from Statistics Canada, tables 12-10-0099-01 and 12-10-0175-01">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={byYear} margin={{ top: 12, right: 16, bottom: 12, left: 4 }}>
            <CartesianGrid stroke={STONE} vertical={false} />
            <XAxis dataKey="y" minTickGap={32} tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => pct(Number(v))} width={44} tick={{ fill: MUTED, fontSize: 11 }} />
            <Tooltip formatter={(v, name) => [pct(Number(v), 1), name === 'us' ? 'To the U.S.' : 'To PNWER states']} />
            <Legend formatter={(name) => (name === 'us' ? 'To the U.S.' : 'To PNWER states')} wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="us" stroke={BRAND_700} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line dataKey="pnwer" stroke={OCHRE} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
