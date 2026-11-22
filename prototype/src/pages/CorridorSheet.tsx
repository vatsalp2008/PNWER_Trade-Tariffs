import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, XAxis, YAxis } from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { Stat } from '../components/Stat'
import { SITE_TITLE } from '../config'
import { lastUpdated } from '../data'
import { integration, loadCorridors, loadPair, sum12, type CorridorBundle, type CorridorIndex, type CorridorPair } from '../data/corridors'
import { compare, loadRegional, type RegionalBundle } from '../data/regional'
import { dateLabel, monthLabel, num, pct, signedPct, usd } from '../lib/format'
import { BRAND_100, BRAND_700, CLAY_100, EXPORT_BAR, IMPORT_BAR, MUTED, OCHRE, STONE } from '../lib/palette'
import { useFitWidth, useOverflowCheck } from '../lib/sheet'

const month = (ym: string) => monthLabel(`${ym}-01`)
/** Corridors big enough for a 2-page sheet (two-way trade over the last 12 months, US$ millions). */
const SHEET_MIN = 250
const ERAS = [
  { from: '1990-12', to: '1993-12', fill: STONE },
  { from: '1994-01', to: '2020-06', fill: '#eef2f3' },
  { from: '2020-07', to: '2025-02', fill: BRAND_100 },
  { from: '2025-03', to: '9999-12', fill: CLAY_100 },
]
const SHORT: Record<string, string> = { BC: 'B.C.', AB: 'Alberta', SK: 'Sask.', YT: 'Yukon', NT: 'N.W.T.', WA: 'Washington', OR: 'Oregon', ID: 'Idaho', MT: 'Montana', AK: 'Alaska' }

/** Two-way trade over the last 12 months for every corridor (US$ millions). */
function corridorSizes(ix: CorridorIndex) {
  return Object.keys(ix.provinces).flatMap((p) => Object.keys(ix.states).map((s) => ({
    p, s, twoWay: (sum12(ix, ix.series[`${p}|${s}|exp|total`]) ?? 0) + (sum12(ix, ix.series[`${p}|${s}|imp|total`]) ?? 0),
  }))).sort((a, b) => b.twoWay - a.twoWay)
}

export function CorridorSheet() {
  const { prov = 'BC', state = 'WA' } = useParams()
  const navigate = useNavigate()
  const stackRef = useRef<HTMLDivElement>(null)
  const zoom = useFitWidth(stackRef)
  const key = `${prov}-${state}`
  const [bundle, setBundle] = useState<CorridorBundle | null>(null)
  const [pair, setPair] = useState<{ key: string; data: CorridorPair } | null>(null)
  const [regional, setRegional] = useState<RegionalBundle | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const c = new AbortController()
    loadCorridors(c.signal).then(setBundle).catch((e: Error) => !c.signal.aborted && setError(e.message))
    loadRegional(c.signal).then(setRegional).catch(() => undefined) // border data is optional on this sheet
    return () => c.abort()
  }, [])
  useEffect(() => {
    if (!bundle) return
    const c = new AbortController()
    loadPair(bundle, key, c.signal).then((data) => setPair({ key, data })).catch((e: Error) => !c.signal.aborted && setError(e.message))
    return () => c.abort()
  }, [bundle, key])
  const ready = bundle && pair?.key === key ? { ix: bundle.index, pair: pair.data } : null
  useOverflowCheck(stackRef, ready ? `corridor ${key}` : 'loading')
  const isReady = ready !== null
  useEffect(() => {
    if (!isReady) return
    const prev = document.title
    document.title = `${prov}–${state} corridor fact sheet`
    return () => { document.title = prev }
  }, [isReady, prov, state])

  if (error) return <div className="not-found"><p>{error}</p><Link to="/data?view=corridors">Back to corridors</Link></div>
  const valid = bundle && Object.hasOwn(bundle.index.provinces, prov) && Object.hasOwn(bundle.index.states, state)
  if (bundle && !valid) return <div className="not-found"><p>That corridor doesn’t exist.</p><Link to="/data?view=corridors">Back to corridors</Link></div>
  const sizes = bundle ? corridorSizes(bundle.index).filter((x) => x.twoWay >= SHEET_MIN) : []

  return (
    <div className="sheet-screen">
      <div className="sheet-toolbar no-print">
        <Link to={`/data?view=corridors&pair=${key}`} className="text-link">← Corridors</Link>
        <select value={key} onChange={(e) => navigate(`/corridor/${e.target.value.replace('-', '/')}`)} aria-label="Corridor">
          {sizes.map((x) => <option key={`${x.p}-${x.s}`} value={`${x.p}-${x.s}`}>{bundle!.index.provinces[x.p]} ↔ {bundle!.index.states[x.s]}</option>)}
          {!sizes.some((x) => `${x.p}-${x.s}` === key) && <option value={key}>{key}</option>}
        </select>
        <button type="button" className="btn-primary" onClick={() => window.print()} disabled={!ready}>Download PDF</button>
        <span className="micro">Opens the print dialog. Choose “Save as PDF”.</span>
      </div>
      <div className="sheet-stack" ref={stackRef} style={{ ['--sheet-zoom' as string]: zoom }}>
        {!ready ? <p role="status">Loading the verified corridor data…</p> : (
          <>
            <PageOne ix={ready.ix} pair={ready.pair} p={prov} s={state} />
            <PageTwo ix={ready.ix} pair={ready.pair} p={prov} s={state} regional={regional} />
          </>
        )}
      </div>
    </div>
  )
}

function Header({ title, sub, tags }: { title: string; sub: string; tags?: string[] }) {
  return (
    <header className="sheet-head">
      <div className="sheet-kicker">
        <span>{SITE_TITLE} · Corridor fact sheet</span>
        <span className="sheet-kicker-right">
          {lastUpdated && <span>Updated {dateLabel(lastUpdated)}</span>}
          <span className="badge badge-real">Official data · sources below</span>
        </span>
      </div>
      <h1>{title}</h1>
      <p className="sheet-sub">{sub}</p>
      {tags && <div className="sheet-tags">{tags.map((t) => <span key={t} className="tag tag-quiet">{t}</span>)}</div>}
    </header>
  )
}

function sections(ix: CorridorIndex, pair: CorridorPair, p: string, s: string, flow: 'exp' | 'imp', end: number) {
  return Object.entries(ix.sections).filter(([sec]) => sec !== 'total')
    .map(([sec, label]) => ({ sec, label, v: sum12(ix, pair.series[`${p}|${s}|${flow}|${sec}`], end) ?? 0 }))
}

function PageOne({ ix, pair, p, s }: { ix: CorridorIndex; pair: CorridorPair; p: string; s: string }) {
  const last = ix.months.length - 1
  const then = last - 24
  const exp = ix.series[`${p}|${s}|exp|total`]
  const imp = ix.series[`${p}|${s}|imp|total`]
  const e12 = sum12(ix, exp)
  const i12 = sum12(ix, imp)
  const ch = (now: number | null, before: number | null) => (now === null || !before ? null : now / before - 1)
  const g = ix.integration[`${p}-${s}`]
  const firstYear = Object.entries(g.byYear).find(([, v]) => v !== null)
  const us = sum12(ix, ix.series[`${p}|US|exp|total`])
  const data = ix.months.map((m, i) => ({ m, exp: i >= 11 ? sum12(ix, exp, i) : null, imp: i >= 11 ? sum12(ix, imp, i) : null })).filter((d) => d.m >= '1990-12')
  const lastM = ix.months[last]
  const P = SHORT[p] ?? ix.provinces[p]
  const S = SHORT[s] ?? ix.states[s]
  return (
    <article className="sheet-page">
      <Header title={`${ix.provinces[p]} ↔ ${ix.states[s]}`} sub={`Trade both ways over the 12 months to ${month(lastM)}, in U.S. dollars (US$).`}
        tags={['Cross-border corridor', `Trade data through ${month(lastM)}`, 'All amounts in US$']} />
      <div className="stat-row">
        <Stat label={`${P} → ${S}`} value={e12 === null ? '—' : usd(e12)} note={`${signedPct(ch(e12, sum12(ix, exp, then)) ?? 0, 0)} vs 12 months to ${month(ix.months[then])}`}
          tone={(ch(e12, sum12(ix, exp, then)) ?? 0) < 0 ? 'down' : 'up'} />
        <Stat label={`${S} → ${P}`} value={i12 === null ? '—' : usd(i12)} note={`${signedPct(ch(i12, sum12(ix, imp, then)) ?? 0, 0)} vs 12 months to ${month(ix.months[then])}`}
          tone={(ch(i12, sum12(ix, imp, then)) ?? 0) < 0 ? 'down' : 'up'} />
        <Stat label="Supply-chain integration score" value={g.last12 === null ? '—' : g.last12.toFixed(2)}
          note={firstYear ? `${firstYear[0]}: ${firstYear[1]!.toFixed(2)} · 1 = same goods both ways` : '1 = same goods both ways'} />
        <Stat label={`${S}’s share of ${P}’s U.S. exports`} value={e12 === null || !us ? '—' : pct(e12 / us, 1)} note="last 12 months" />
      </div>
      <ChartCard title={`${P} ↔ ${S} since 1990`} subtitle="12-month totals each way, US$, not adjusted for inflation. Shaded: before NAFTA, NAFTA (1994), USMCA (July 2020), tariff era (March 2025)."
        source="Adapted from Statistics Canada, table 12-10-0099-01">
        <ComposedChart width={720} height={215} data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          {ERAS.map((e) => <ReferenceArea key={e.from} x1={e.from} x2={e.to > lastM ? lastM : e.to} fill={e.fill} fillOpacity={1} ifOverflow="hidden" />)}
          <CartesianGrid stroke="#ffffff" strokeOpacity={0.9} vertical={false} />
          <XAxis dataKey="m" tickFormatter={(m) => String(m).slice(0, 4)} minTickGap={36} tick={{ fill: MUTED, fontSize: 10 }} />
          <YAxis tickFormatter={(v) => usd(Number(v))} width={64} tick={{ fill: MUTED, fontSize: 10 }} />
          <Legend formatter={(n) => (n === 'exp' ? `${P} → ${S}` : `${S} → ${P}`)} wrapperStyle={{ fontSize: 10 }} />
          <Line dataKey="exp" stroke={BRAND_700} strokeWidth={1.8} dot={false} isAnimationActive={false} />
          <Line dataKey="imp" stroke={OCHRE} strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ChartCard>
      <ChartCard title="What crosses each way, last 12 months" source="Adapted from Statistics Canada, table 12-10-0099-01 (HS sections; % = change vs two years earlier)">
        <div className="products-grid">
          <TopSections ix={ix} pair={pair} p={p} s={s} flow="exp" color={EXPORT_BAR} />
          <TopSections ix={ix} pair={pair} p={p} s={s} flow="imp" color={IMPORT_BAR} />
        </div>
      </ChartCard>
      <footer className="sheet-foot">
        <span>Page 1 of 2{lastUpdated ? ` · Updated ${dateLabel(lastUpdated)}` : ''}</span>
        <span>Adapted from Statistics Canada, table 12-10-0099-01 (not an endorsement by Statistics Canada); Bank of Canada and Federal Reserve exchange rates.</span>
      </footer>
    </article>
  )
}

/** The six largest HS sections one way across the corridor, with the change vs two years earlier. */
function TopSections({ ix, pair, p, s, flow, color }: { ix: CorridorIndex; pair: CorridorPair; p: string; s: string; flow: 'exp' | 'imp'; color: string }) {
  const last = ix.months.length - 1
  const rows = sections(ix, pair, p, s, flow, last).sort((a, b) => b.v - a.v).slice(0, 6)
  const max = Math.max(...rows.map((r) => r.v), 0.001)
  const before = Object.fromEntries(sections(ix, pair, p, s, flow, last - 24).map((r) => [r.sec, r.v]))
  const P = SHORT[p] ?? ix.provinces[p]
  const S = SHORT[s] ?? ix.states[s]
  return (
    <div className="products">
      <h4>{flow === 'exp' ? `What ${P} sells ${S}` : `What ${S} sells ${P}`}</h4>
      <ol>
        {rows.map((r) => (
          <li key={r.sec}>
            <span className="prod-bar" style={{ width: `${(r.v / max) * 100}%`, background: color }} />
            <span className="prod-name">{r.label} <span className="hs">{r.sec}</span></span>
            <span className="prod-value">{usd(r.v)}{before[r.sec] >= 5 ? <span className="hs"> {signedPct(r.v / before[r.sec] - 1, 0)}</span> : null}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PageTwo({ ix, pair, p, s, regional }: { ix: CorridorIndex; pair: CorridorPair; p: string; s: string; regional: RegionalBundle | null }) {
  const last = ix.months.length - 1
  const P = SHORT[p] ?? ix.provinces[p]
  const S = SHORT[s] ?? ix.states[s]
  const shared = Object.entries(ix.sections).filter(([sec]) => sec !== 'total').map(([sec, label]) => {
    const x = sum12(ix, pair.series[`${p}|${s}|exp|${sec}`]) ?? 0
    const m = sum12(ix, pair.series[`${p}|${s}|imp|${sec}`]) ?? 0
    return { sec, label, x, m, g: integration(x, m) }
  }).filter((r) => r.x + r.m >= 50 && r.g !== null).sort((a, b) => b.g! - a.g!).slice(0, 5)
  const impacts = (ix.impacts?.[`${p}-${s}`] ?? []).slice().sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 6)
    .sort((a, b) => a.date.localeCompare(b.date))
  const border = regional && p === 'BC' && (s === 'WA' || s === 'ID') ? regional.dataset : null
  return (
    <article className="sheet-page">
      <Header title="Shared supply chains, tariffs and the border" sub={`${ix.provinces[p]} ↔ ${ix.states[s]} · all amounts in US$ · trade data through ${month(ix.months[last])}`} />
      <div className="two-col">
        <ChartCard title="Shared supply chains" source="Calculated from Statistics Canada, table 12-10-0099-01">
          <p className="micro">Sections where similar goods flow both ways: parts and products that may cross the border several times, so a tariff can hit them more than once. Score 1 = perfectly two-way.</p>
          <table className="tariff-table">
            <thead><tr><th>Section</th><th className="r">{P} → {S}</th><th className="r">{S} → {P}</th><th className="r">Score</th></tr></thead>
            <tbody>{shared.map((r) => <tr key={r.sec}><td>{r.label}</td><td className="r">{usd(r.x)}</td><td className="r">{usd(r.m)}</td><td className="r">{r.g!.toFixed(2)}</td></tr>)}</tbody>
          </table>
        </ChartCard>
        {border ? <Border d={border} s={s} /> : <Destinations ix={ix} p={p} />}
      </div>
      <ChartCard title="Did tariff actions change this corridor’s trade?"
        subtitle="The product sections each action hit vs the corridor’s other trade (energy left out), each compared with the same months a year earlier. Indicative, not proof."
        source="Calculated from Statistics Canada, table 12-10-0099-01, and the site’s tariff timeline">
        {impacts.length ? (
          <table className="tariff-table">
            <thead><tr><th>Date</th><th>Action</th><th>Trade hit</th><th className="r">Hit sections</th><th className="r">Other trade</th><th className="r">Indicative effect</th><th className="r">Before</th></tr></thead>
            <tbody>
              {impacts.map((r) => (
                <tr key={r.id}>
                  <td className="nowrap">{month(r.date.slice(0, 7))}</td>
                  <td>{r.measure}</td>
                  <td className="nowrap">{r.flow === 'exp' ? `${P} → ${S}` : `${S} → ${P}`}</td>
                  <td className="r">{signedPct(r.hitChange, 0)}</td>
                  <td className="r">{signedPct(r.otherChange, 0)}</td>
                  <td className="r num-cell">{signedPct(r.effect, 0)}</td>
                  <td className="r">{r.preTrend === null ? '—' : `${signedPct(r.preTrend, 0)}${Math.abs(r.preTrend) > 0.1 ? '†' : ''}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="micro">No targeted tariff action touched enough of this corridor’s trade to measure.</p>}
        <p className="micro">“Before” runs the same comparison for the 12 months before the action; † = the groups were already moving apart, so read with care. Up to 12 months after each action; actions overlap; sections are broad (XVII includes aircraft and ships).</p>
      </ChartCard>
      <div className="two-col">
        <section className="card notes-card">
          <h3>About these numbers</h3>
          <ul className="micro">
            <li>Canadian “domestic exports” (made or grown in the province) and all imports cleared in it; the state is the declared destination or origin.</li>
            <li>US$ at monthly Bank of Canada rates (Federal Reserve before 2017); values are not adjusted for inflation.</li>
            <li>Built on the project team’s cleaning of Statistics Canada table 12-10-0099. Terms explained at {window.location.host}/glossary.</li>
          </ul>
        </section>
        <section className="card notes-card">
          <h3>Sources</h3>
          <ul className="micro">
            <li>Adapted from Statistics Canada, tables 12-10-0099-01 and 12-10-0175-01. This does not constitute an endorsement by Statistics Canada.</li>
            <li>Border and energy figures: BTS, Statistics Canada 24-10-0053, EIA and Canada Energy Regulator (where shown).</li>
            <li>Tariff actions: the site’s curated timeline, each linked to its official source.</li>
          </ul>
        </section>
      </div>
      <footer className="sheet-foot">
        <span>Page 2 of 2{lastUpdated ? ` · Updated ${dateLabel(lastUpdated)}` : ''}</span>
        <span>{ix.provinces[p]} ↔ {ix.states[s]} corridor · {usd((sum12(ix, ix.series[`${p}|${s}|exp|total`]) ?? 0) + (sum12(ix, ix.series[`${p}|${s}|imp|total`]) ?? 0))} two-way trade</span>
      </footer>
    </article>
  )
}

/** B.C.–Washington and B.C.–Idaho: crossings, Canadians driving home, and gas through the corridor's crossing. */
function Border({ d, s }: { d: RegionalBundle['dataset']; s: string }) {
  const t = d.travellers
  const ports = Object.keys(t.ports).filter((g) => t.ports[g].facing === s)
  const sum = (key: 'now' | 'before') => ports.reduce((a, g) => a + (compare(t.months, t.series[g], t.lastMonth)[key] ?? 0), 0)
  const cars = { now: sum('now'), before: sum('before') }
  const c = d.crossings
  const trucks = Object.keys(c.ports).filter((code) => c.ports[code].state === s).map((code) => compare(c.months, c.series[`${code}|Trucks`], c.lastMonth))
  const tNow = trucks.reduce((a, x) => a + (x.now ?? 0), 0)
  const tBefore = trucks.reduce((a, x) => a + (x.before ?? 0), 0)
  const g = d.energy.gas
  const gp = Object.keys(g.ports).find((k) => g.ports[k].state === s)!
  return (
    <ChartCard title="At the border" source="Statistics Canada 24-10-0053; BTS Border Crossing Entry Data; EIA natural gas imports">
      <dl className="facts">
        <dt>Canadians driving home through the {ports.length} B.C. crossings facing {d.states[s]}, {month(t.lastMonth)}</dt>
        <dd>{num(cars.now)} <span className="dd-note">{cars.before ? `${signedPct(cars.now / cars.before - 1, 0)} vs ${month(compare(t.months, undefined, t.lastMonth).then)}` : ''}</span></dd>
        <dt>Trucks entering {d.states[s]} from Canada, {month(c.lastMonth)}</dt>
        <dd>{num(tNow)} <span className="dd-note">{tBefore ? `${signedPct(tNow / tBefore - 1, 0)} vs ${month(compare(c.months, undefined, c.lastMonth).then)}` : ''}</span></dd>
        <dt>Canadian natural gas via {g.ports[gp].bcPort} → {g.ports[gp].name}, {month(g.lastMonth)}</dt>
        <dd>{num(g.mmcf[gp][g.mmcf[gp].length - 1] ?? 0)} MMcf <span className="dd-note">{pct(g.mmcf[gp].slice(-12).reduce<number>((a, v) => a + (v ?? 0), 0) / g.usTotalMmcf.slice(-12).reduce((a, v) => a + v, 0))} of all Canadian pipeline gas (12 mo.)</span></dd>
      </dl>
    </ChartCard>
  )
}

/** Other corridors: where the province's exports go. */
function Destinations({ ix, p }: { ix: CorridorIndex; p: string }) {
  const world = sum12(ix, ix.series[`${p}|WORLD|exp|total`])
  const us = sum12(ix, ix.series[`${p}|US|exp|total`])
  const pnwer = Object.keys(ix.states).reduce((a, st) => a + (sum12(ix, ix.series[`${p}|${st}|exp|total`]) ?? 0), 0)
  return (
    <ChartCard title={`Where ${ix.provinces[p]}’s exports go`} source="Adapted from Statistics Canada, tables 12-10-0099-01 and 12-10-0175-01">
      {world && us !== null ? (
        <dl className="facts">
          <dt>To the five PNWER states</dt><dd>{usd(pnwer)} <span className="dd-note">{pct(pnwer / world)} of all exports</span></dd>
          <dt>To the rest of the U.S.</dt><dd>{usd(us - pnwer)} <span className="dd-note">{pct((us - pnwer) / world)}</span></dd>
          <dt>To the rest of the world</dt><dd>{usd(world - us)} <span className="dd-note">{pct((world - us) / world)}</span></dd>
        </dl>
      ) : <p className="micro">Not available</p>}
    </ChartCard>
  )
}
