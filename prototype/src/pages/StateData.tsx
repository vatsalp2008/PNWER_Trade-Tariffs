import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { data as site, trade as dashboardTrade } from '../data'
import { compare, loadRegional, PLACES, rankedIndustries, tradeCsv, tradeSeries, type RegionalBundle, type RegionalDataset } from '../data/regional'
import { compactNum, monthLabel, NOT_AVAILABLE, num, pct, signedPct, usd } from '../lib/format'
import { BRAND_700, MUTED, STONE } from '../lib/palette'

const month = (ym: string) => monthLabel(`${ym}-01`)
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const changeCell = (c: number | null) => (c === null ? NOT_AVAILABLE : <span className={c < 0 ? 'down' : 'up'}>{signedPct(c, 0)}</span>)

/** Jurisdiction menu shared by the state and province views of the Data & verification page. */
export function PlaceSelect({ value, onChange }: { value: string; onChange: (place: string) => void }) {
  return (
    <label>
      <span>Jurisdiction</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(PLACES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>
  )
}

/** Washington or Idaho: trade by industry, border crossings and Canadian travellers. */
export function StateData({ state }: { state: 'WA' | 'ID' }) {
  const [bundle, setBundle] = useState<RegionalBundle | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    loadRegional(controller.signal).then(setBundle).catch((e: Error) => {
      if (!controller.signal.aborted) setError(e.message)
    })
    return () => controller.abort()
  }, [attempt])
  return (
    <>
      <p className="intro">
        Monthly trade with Canada by industry, crossings at every border port, and Canadians driving home through the B.C.
        crossings next door. Amounts are in <strong>U.S. dollars (US$)</strong>; the all-industry totals match the dashboard and
        fact sheets exactly.
      </p>
      {!bundle && !error && <p role="status">Loading the verified data snapshot…</p>}
      {error && (
        <section className="card" role="alert">
          <h2>Data could not be loaded</h2>
          <p>{error}</p>
          <button className="btn-primary" onClick={() => { setError(''); setAttempt(attempt + 1) }}>Retry</button>
          <p>No sample figures are substituted.</p>
        </section>
      )}
      {bundle && <StateExplorer bundle={bundle} state={state} />}
    </>
  )
}

function StateExplorer({ bundle, state }: { bundle: RegionalBundle; state: 'WA' | 'ID' }) {
  const { dataset: d, manifest } = bundle
  const [params, setParams] = useSearchParams()
  const flow = params.get('flow') === 'imp' ? 'imp' : 'exp'
  const requested = params.get('product') ?? ''
  const naics = Object.hasOwn(d.trade.industries, requested) ? requested : 'all'
  const count = [12, 24, 36].includes(Number(params.get('months'))) ? Number(params.get('months')) : 36
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    next.delete('page')
    for (const [k, v] of Object.entries(patch)) next.set(k, v)
    setParams(next)
  }

  const months = d.trade.months
  const last = months[months.length - 1]
  const canada = tradeSeries(d, state, flow, 'canada', naics)
  const world = tradeSeries(d, state, flow, 'world', naics)
  const i = months.length - 1
  const last12 = canada.slice(-12).reduce((a, v) => a + v, 0) / 1e6
  const yoy = canada[i - 12] ? canada[i] / canada[i - 12] - 1 : null
  const share = world[i] ? canada[i] / world[i] : null
  const field = flow === 'exp' ? 'exports' : 'imports'
  const dashboard = naics === 'all' && last === site.meta.dataAsOf ? dashboardTrade(state, 'all').last12[field] : null
  const what = flow === 'exp' ? 'Exports to Canada' : 'Imports from Canada'
  const label = naics === 'all' ? 'All industries' : d.trade.industries[naics]
  const ranked = rankedIndustries(d, state, flow, 'canada')
  const maximum = ranked[0]?.last12 || 1
  const rows = months.map((m, k) => ({ m, canada: canada[k], world: world[k] })).slice(-count)
  const pages = Math.ceil(rows.length / 12)
  const page = Math.min(Math.max(0, Number(params.get('page') ?? 0) || 0), pages - 1)
  const download = () => {
    const url = URL.createObjectURL(new Blob([tradeCsv(d, state, flow, naics, count)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${state}-${field}-${naics}-${count}-months.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <p className="mode-note">
        Source: U.S. Census Bureau, trade by NAICS industry · data through {month(last)}
        {last === site.meta.dataAsOf ? ' (same as the dashboard)' : ''} · <strong>{manifest.quality.checks.length} automated checks passed</strong>
      </p>
      <div className="controls">
        <PlaceSelect value={state} onChange={(p) => update({ province: p })} />
        <label>
          <span>Direction</span>
          <select value={flow} onChange={(e) => update({ flow: e.target.value })}>
            <option value="exp">Exports to Canada</option>
            <option value="imp">Imports from Canada</option>
          </select>
        </label>
        <label className="prov-product">
          <span>Industry (NAICS)</span>
          <select value={naics} onChange={(e) => update({ product: e.target.value })}>
            <option value="all">All industries</option>
            {ranked.map((x) => <option key={x.naics} value={x.naics}>{d.trade.industries[x.naics]}</option>)}
          </select>
        </label>
        <label>
          <span>Trend range</span>
          <select value={count} onChange={(e) => update({ months: e.target.value })}>
            {[12, 24, 36].map((n) => <option key={n} value={n}>Last {n} months</option>)}
          </select>
        </label>
      </div>
      <p className="micro">
        Industries are the Census Bureau’s NAICS groups, not the dashboard’s sectors, so only the all-industries total has an
        exact dashboard equivalent.
      </p>

      <div className="prov-stats" aria-live="polite">
        <div className="stat">
          <div className="stat-label">{what}, last 12 months</div>
          <div className="stat-value">{usd(last12)}</div>
          <div className="stat-note">
            {dashboard !== null ? <>Dashboard and fact sheet: {usd(dashboard)} (same Census total)</> : label}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">{what} · {month(last)}</div>
          <div className="stat-value">{usd(canada[i] / 1e6)}</div>
          <div className="stat-note">{label}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Year-over-year change</div>
          <div className="stat-value">{yoy === null ? NOT_AVAILABLE : signedPct(yoy)}</div>
          <div className="stat-note">Same month one year earlier</div>
        </div>
        <div className="stat">
          <div className="stat-label">Canada’s share of all {field}</div>
          <div className="stat-value">{share === null ? NOT_AVAILABLE : pct(share, 1)}</div>
          <div className="stat-note">Same industry and month</div>
        </div>
      </div>

      <div className="dash-grid">
        <ChartCard title={`Monthly ${field} ${flow === 'exp' ? 'to' : 'from'} Canada`} subtitle={`${label} · ${month(rows[0].m)}–${month(last)} · US$, not adjusted for inflation`}
          source="U.S. Census Bureau, international trade API (statenaics)" exportName={`${state}-${field}-${naics}-monthly`}>
          <TrendChart points={rows.map((r) => ({ label: month(r.m), value: r.canada / 1e6 }))} money />
        </ChartCard>
        <ChartCard title={`Largest industries, last 12 months`} subtitle={`${what}, US$. Select an industry to see its trend.`}>
          <ul className="prov-ranking">
            {ranked.slice(0, 12).map((x) => (
              <li key={x.naics}>
                <button type="button" aria-pressed={naics === x.naics} onClick={() => update({ product: x.naics })}>
                  <span>{d.trade.industries[x.naics]}</span>
                  <strong>{usd(x.last12 / 1e6)}</strong>
                  <span className="prov-bar"><span style={{ width: `${(100 * x.last12) / maximum}%` }} /></span>
                </button>
              </li>
            ))}
          </ul>
        </ChartCard>
      </div>

      <ChartCard title="Records behind the chart" subtitle={`${rows.length} months of ${lowerFirst(label)}. Only 12 rows are shown at a time.`}>
        <div className="prov-downloads"><button className="tab" onClick={download}>Download selected CSV</button></div>
        <div className="prov-table-wrap">
          <table className="prov-table">
            <thead><tr><th>Month</th><th>With Canada (US$)</th><th>With all countries (US$)</th><th>Canada’s share</th></tr></thead>
            <tbody>
              {[...rows].reverse().slice(page * 12, page * 12 + 12).map((r) => (
                <tr key={r.m}><td>{month(r.m)}</td><td>{usd(r.canada / 1e6)}</td><td>{usd(r.world / 1e6)}</td><td>{r.world > 0 ? pct(r.canada / r.world, 1) : NOT_AVAILABLE}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="prov-pagination">
          <button className="tab" disabled={page === 0} onClick={() => update({ page: String(page - 1) })}>Previous</button>
          <span aria-live="polite">Page {page + 1} of {pages}</span>
          <button className="tab" disabled={page >= pages - 1} onClick={() => update({ page: String(page + 1) })}>Next</button>
        </div>
      </ChartCard>

      <h2 className="section-title">At the border</h2>
      <Crossings d={d} state={state} />
      <Travellers d={d} state={state} />
      <Plates d={d} state={state} />

      <h2 className="section-title">Energy links</h2>
      <Energy d={d} state={state} />

      <h2 className="section-title">Border communities</h2>
      <Counties d={d} state={state} />

      <h2 className="section-title">Canadian investment</h2>
      <Ownership d={d} state={state} />

      <details className="card prov-quality">
        <summary>Sources, checks and research limitations</summary>
        <ol>{manifest.quality.checks.map((c) => <li key={c.name}><strong>Passed: {c.name}.</strong> {c.detail}</li>)}</ol>
        <h2>Sources</h2>
        <ul>{Object.values(d.sources).map((s) => <li key={s}>{s}</li>)}</ul>
        <h2>Review notes</h2>
        <ul>
          <li>Exports are counted by the state they ship from, which isn’t always where goods were made; imports by the state they go to.</li>
          <li>Border counts are entries into the U.S. or into Canada, not round trips, and count vehicles or people as labelled.</li>
          <li>Statistics Canada’s daily licence-plate counts are a preliminary leading indicator and may be revised.</li>
        </ul>
        <p>Version: <code>{manifest.version}</code>. Snapshot published: {manifest.generatedAt}.</p>
      </details>
    </>
  )
}

/** Inbound crossings at each port in the state, latest month vs the same month two years earlier. */
function Crossings({ d, state }: { d: RegionalDataset; state: string }) {
  const c = d.crossings
  const ports = Object.entries(c.ports).filter(([, p]) => p.state === state)
  const at = (code: string, measure: string) => compare(c.months, c.series[`${code}|${measure}`], c.lastMonth)
  const rows = ports.map(([code, p]) => ({ code, name: p.name, cars: at(code, 'Personal Vehicles'), trucks: at(code, 'Trucks') }))
    .filter((r) => r.cars.now !== null || r.trucks.now !== null)
    .sort((a, b) => (b.cars.now ?? 0) - (a.cars.now ?? 0))
  const total = (key: 'cars' | 'trucks') => {
    const now = rows.reduce((s, r) => s + (r[key].now ?? 0), 0)
    const before = rows.reduce((s, r) => s + (r[key].before ?? 0), 0)
    return { now, change: before ? now / before - 1 : null }
  }
  const span = c.months.slice(-36)
  const trend = span.map((m) => ({
    label: month(m),
    value: ports.reduce((s, [code]) => s + (c.series[`${code}|Personal Vehicles`]?.[c.months.indexOf(m)] ?? 0), 0),
  }))
  const then = month(compare(c.months, undefined, c.lastMonth).then)
  return (
    <div className="dash-grid">
      <ChartCard title={`Crossings into ${d.states[state]} from Canada · ${month(c.lastMonth)}`}
        subtitle={`Vehicles entering the U.S. at each port, compared with ${then}.`}
        source="Bureau of Transportation Statistics, Border Crossing Entry Data (from U.S. Customs and Border Protection)">
        <div className="prov-table-wrap">
          <table className="prov-table">
            <thead><tr><th>Port</th><th>Personal vehicles</th><th>vs {then}</th><th>Trucks</th><th>vs {then}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code}>
                  <td>{r.name}</td>
                  <td>{r.cars.now === null ? NOT_AVAILABLE : num(r.cars.now)}</td><td>{changeCell(r.cars.change)}</td>
                  <td>{r.trucks.now === null ? NOT_AVAILABLE : num(r.trucks.now)}</td><td>{changeCell(r.trucks.change)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>All ports</td><td>{num(total('cars').now)}</td><td>{changeCell(total('cars').change)}</td>
                <td>{num(total('trucks').now)}</td><td>{changeCell(total('trucks').change)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </ChartCard>
      <ChartCard title="Personal vehicles entering, by month" subtitle={`All ${d.states[state]} ports · ${month(span[0])}–${month(c.lastMonth)}`}
        source="Bureau of Transportation Statistics">
        <TrendChart points={trend} />
      </ChartCard>
    </div>
  )
}

/** Canadian residents driving home through the B.C. ports across from this state. */
function Travellers({ d, state }: { d: RegionalDataset; state: string }) {
  const t = d.travellers
  const ports = Object.entries(t.ports).filter(([, p]) => p.facing === state)
  const rows = ports.map(([id, p]) => ({ id, ...p, ...compare(t.months, t.series[id], t.lastMonth) }))
    .sort((a, b) => (b.now ?? 0) - (a.now ?? 0))
  const now = rows.reduce((s, r) => s + (r.now ?? 0), 0)
  const before = rows.reduce((s, r) => s + (r.before ?? 0), 0)
  const then = month(compare(t.months, undefined, t.lastMonth).then)
  const span = t.months.slice(-36)
  const trend = span.map((m) => ({ label: month(m), value: ports.reduce((s, [id]) => s + (t.series[id][t.months.indexOf(m)] ?? 0), 0) }))
  return (
    <div className="dash-grid">
      <ChartCard title={`Canadians driving home through B.C. crossings facing ${d.states[state]} · ${month(t.lastMonth)}`}
        subtitle={`Canadian residents returning from the U.S. by car, by B.C. port (U.S. port across), compared with ${then}.`}
        source="Adapted from Statistics Canada, table 24-10-0053-01">
        <div className="prov-table-wrap">
          <table className="prov-table">
            <thead><tr><th>B.C. port (across from)</th><th>{month(t.lastMonth)}</th><th>{then}</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name} ({r.usPort})</td>
                  <td>{r.now === null ? NOT_AVAILABLE : num(r.now)}</td>
                  <td>{r.before === null ? NOT_AVAILABLE : num(r.before)}</td>
                  <td>{changeCell(r.change)}</td>
                </tr>
              ))}
              <tr className="total-row"><td>All {rows.length} crossings</td><td>{num(now)}</td><td>{num(before)}</td><td>{changeCell(before ? now / before - 1 : null)}</td></tr>
            </tbody>
          </table>
        </div>
      </ChartCard>
      <ChartCard title="Canadians driving home, by month" subtitle={`These ${rows.length} crossings · ${month(span[0])}–${month(t.lastMonth)}`}
        source="Adapted from Statistics Canada, table 24-10-0053-01">
        <TrendChart points={trend} />
      </ChartCard>
    </div>
  )
}

/** Travellers in this state's licence-plated vehicles entering B.C. (daily leading indicator, summed by month). */
function Plates({ d, state }: { d: RegionalDataset; state: string }) {
  const p = d.plates
  const series = p.series[state]
  const lastMonth = p.months[p.months.length - 1]
  const [y, m] = lastMonth.split('-').map(Number)
  const complete = p.days[lastMonth] >= new Date(y, m, 0).getDate()
  const shown = complete ? lastMonth : p.months[p.months.length - 2]
  const c = compare(p.months, series, shown, 1)
  const span = p.months.slice(-36).filter((mm) => complete || mm !== lastMonth)
  return (
    <ChartCard title={`Travellers in ${d.states[state]}-plated vehicles entering B.C.`}
      subtitle={`${month(shown)}: ${c.now === null ? NOT_AVAILABLE : num(c.now)} (${c.change === null ? 'no comparison' : `${signedPct(c.change, 0)} vs ${month(c.then)}`}). Preliminary daily counts, summed by month.`}
      source="Adapted from Statistics Canada, table 24-10-0057-01 (leading indicator)">
      <TrendChart points={span.map((mm) => ({ label: month(mm), value: series[p.months.indexOf(mm)] ?? 0 }))} height={200} />
    </ChartCard>
  )
}

/** Gas through the state's border crossing, Washington's crude, electricity with B.C., and gas prices. */
function Energy({ d, state }: { d: RegionalDataset; state: string }) {
  const g = d.energy.gas
  const port = Object.keys(g.ports).find((k) => g.ports[k].state === state)!
  const p = g.ports[port]
  const last = g.mmcf[port].length - 1
  const sum12 = (s: (number | null)[]) => s.slice(-12).reduce<number>((a, v) => a + (v ?? 0), 0)
  const share12 = sum12(g.mmcf[port]) / sum12(g.usTotalMmcf)
  const gasYoY = compare(g.months, g.mmcf[port], g.lastMonth, 1)
  const cerUsd = sum12(g.cer[port].usd)
  const c = d.energy.crude
  const crudeShare = c.months.map((m, i) => ({ label: month(m), value: c.kbbl.world[i] ? (c.kbbl.canada[i] ?? 0) / (c.kbbl.world[i] ?? 1) : 0 }))
  const crudeNow = c.kbbl.canada[c.kbbl.canada.length - 1] ?? 0
  const crudeAll = c.kbbl.world[c.kbbl.world.length - 1] ?? 0
  const e = d.energy.electricity
  const el = (dir: string, unit: string) => sum12(e.series[`${state}|${dir}|${unit}`] ?? [])
  const prices = d.energy.gasPrices
  const priceRow = (kind: string) => compare(prices.months, prices.series[`${state}|${kind}`], prices.months[prices.months.length - 1], 1)
  const priceCard = (
    <ChartCard title={`Gas prices in ${d.states[state]}`} subtitle="What utilities pay at the city gate and what homes pay, $ per thousand cubic feet."
      source="U.S. Energy Information Administration, natural gas prices">
      <PriceTable rows={[['Utilities (citygate)', priceRow('citygate')], ['Homes (residential)', priceRow('residential')]]} />
    </ChartCard>
  )
  const gasNote = gasYoY.change === null ? 'no comparison' : `${signedPct(gasYoY.change, 0)} vs ${month(gasYoY.then)}`
  return (
    <>
      <div className="dash-grid">
        <ChartCard title={`Canadian natural gas entering at ${p.name}`}
          subtitle={`${month(g.lastMonth)}: ${num(g.mmcf[port][last] ?? 0)} million cubic feet at $${(g.price[port][last] ?? 0).toFixed(2)} per thousand (${gasNote}). Last 12 months: ${pct(share12)} of all Canadian gas piped into the U.S.; ${usd(cerUsd / 1e6)} by Canada's count of exports at ${p.bcPort}.`}
          source="U.S. Energy Information Administration, natural gas imports by point of entry; Canada Energy Regulator">
          <TrendChart points={g.months.map((m, i) => ({ label: month(m), value: g.mmcf[port][i] ?? 0 }))} height={220} />
        </ChartCard>
        {state === 'WA' ? (
          <ChartCard title="Canada's share of the foreign crude run by Washington refineries"
            subtitle={`${month(c.lastMonth)}: ${pct(crudeAll ? crudeNow / crudeAll : 0)} (${num(crudeNow)} of ${num(crudeAll)} thousand barrels). Excludes crude from Alaska and other U.S. states.`}
            source="U.S. Energy Information Administration, crude oil imports by refinery state">
            <TrendChart points={crudeShare} percent height={220} />
          </ChartCard>
        ) : priceCard}
      </div>
      <div className="dash-grid">
        <ChartCard title={`Electricity trade with Canada, 12 months to ${month(e.lastMonth)}`}
          subtitle="Megawatt-hours and value, mostly with British Columbia. Reported by Canada; values in US$ at the dashboard's exchange rates."
          source="Canada Energy Regulator, electricity exports and imports">
          <div className="prov-table-wrap">
            <table className="prov-table">
              <thead><tr><th>Direction</th><th>Megawatt-hours</th><th>Value (US$)</th></tr></thead>
              <tbody>
                <tr><td>From Canada to {d.states[state]}</td><td>{num(el('fromCanada', 'mwh'))}</td><td>{usd(el('fromCanada', 'usd') / 1e6)}</td></tr>
                <tr><td>From {d.states[state]} to Canada</td><td>{num(el('toCanada', 'mwh'))}</td><td>{usd(el('toCanada', 'usd') / 1e6)}</td></tr>
              </tbody>
            </table>
          </div>
        </ChartCard>
        {state === 'WA' ? priceCard : <div />}
      </div>
    </>
  )
}

function PriceTable({ rows }: { rows: [string, ReturnType<typeof compare>][] }) {
  return (
    <div className="prov-table-wrap">
      <table className="prov-table">
        <thead><tr><th>Price</th><th>Latest month</th><th>A year earlier</th><th>Change</th></tr></thead>
        <tbody>
          {rows.map(([label, r]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{r.now === null ? NOT_AVAILABLE : `$${r.now.toFixed(2)}`}</td>
              <td>{r.before === null ? NOT_AVAILABLE : `$${r.before.toFixed(2)}`}</td>
              <td>{changeCell(r.change)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="micro">Summer home prices look high because fixed monthly charges are spread over little gas use.</p>
    </div>
  )
}

/** Jobs in the border counties' tourism and shopping industries (BLS QCEW, private sector). */
function Counties({ d, state }: { d: RegionalDataset; state: string }) {
  const c = d.counties
  const q = c.quarters.length - 1
  const quarter = (i: number) => c.quarters[i].replace('-', ' ')
  const rows = Object.entries(c.counties).filter(([, x]) => x.state === state).flatMap(([fips, x]) =>
    Object.entries(c.industries).map(([ind, label]) => {
      const s = c.jobs[`${fips}|${ind}`]
      const now = s[q]
      const ch = (k: number) => (now !== null && s[q - k] ? now / (s[q - k] as number) - 1 : null)
      return { key: `${fips}|${ind}`, county: x.name, label, now, y1: ch(4), y2: ch(8), wage: c.wages[`${fips}|${ind}`][q] }
    }))
  return (
    <ChartCard title={`Jobs in ${d.states[state]}'s border counties · ${quarter(q)}`}
      subtitle={`Private-sector jobs in the last month of the quarter, compared with ${quarter(q - 4)} and ${quarter(q - 8)}. Shopping and tourism are where fewer Canadian visitors show up first.`}
      source="U.S. Bureau of Labor Statistics, Quarterly Census of Employment and Wages">
      <div className="prov-table-wrap">
        <table className="prov-table">
          <thead><tr><th>County · industry</th><th>Jobs</th><th>vs {quarter(q - 4)}</th><th>vs {quarter(q - 8)}</th><th>Avg weekly wage</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className={r.label === 'All private jobs' ? 'total-row' : ''}>
                <td>{r.county} · {r.label}</td>
                <td>{r.now === null ? NOT_AVAILABLE : num(r.now)}</td>
                <td>{changeCell(r.y1)}</td>
                <td>{changeCell(r.y2)}</td>
                <td>{r.wage === null ? NOT_AVAILABLE : `$${num(r.wage)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}

/** Canadian-owned companies' assets and jobs in the state (BEA, majority-owned U.S. affiliates). */
function Ownership({ d, state }: { d: RegionalDataset; state: string }) {
  const o = d.ownership.states[state]
  const part = (k: string) => {
    const ca = o[`${k}Canada`]
    const all = o[`${k}All`]
    return ca != null && all ? ca / all : null
  }
  const n = (k: string) => (o[`${k}Canada`] == null ? NOT_AVAILABLE : num(o[`${k}Canada`] as number))
  const stat = (label: string, value: string, k: string) => {
    const share = part(k)
    return (
      <div className="stat">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        <div className="stat-note">{share === null ? 'Share not available' : `${pct(share)} of the figure for all foreign-owned companies`}</div>
      </div>
    )
  }
  return (
    <>
      <div className="prov-stats ownership-stats">
        {stat('Property, plant & equipment of Canadian-owned companies', o.ppeCanada == null ? NOT_AVAILABLE : usd(o.ppeCanada / 1e6), 'ppe')}
        {stat('Jobs at Canadian-owned companies', n('jobs'), 'jobs')}
        {stat('Manufacturing jobs at Canadian-owned companies', n('mfgJobs'), 'mfgJobs')}
      </div>
      <p className="micro">U.S. Bureau of Economic Analysis, majority-owned U.S. affiliates of Canadian companies, preliminary {d.ownership.year}.</p>
    </>
  )
}

function TrendChart({ points, money = false, percent = false, height = 260 }: { points: { label: string; value: number }[]; money?: boolean; percent?: boolean; height?: number }) {
  const fmt = (v: number) => (money ? usd(v) : percent ? pct(v) : compactNum(v))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points} margin={{ top: 12, right: 16, bottom: 12, left: 12 }}>
        <CartesianGrid stroke={STONE} vertical={false} />
        <XAxis dataKey="label" minTickGap={42} tick={{ fill: MUTED, fontSize: 11 }} />
        <YAxis tickFormatter={fmt} width={76} tick={{ fill: MUTED, fontSize: 11 }} domain={[0, 'auto']} />
        <Tooltip formatter={(v) => [fmt(Number(v)), '']} />
        <Line dataKey="value" stroke={BRAND_700} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
