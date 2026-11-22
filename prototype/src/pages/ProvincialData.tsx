import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { SiteHeader } from '../components/SiteHeader'
import { data as site, fxMonthly, trade } from '../data'
import { cadToUsdM, loadProvincial, monthlySelection, selectionCsv, type ProvincialBundle } from '../data/provincial'
import { isStatePlace } from '../data/regional'
import type { JurisdictionId } from '../data/types'
import { money, monthLabel, NOT_AVAILABLE, usd } from '../lib/format'
import { BRAND_700, MUTED, STONE } from '../lib/palette'
import { PlaceSelect, StateData } from './StateData'
import { Corridors } from './CorridorData'
import { CounterTariffData } from './CounterTariffData'

/** '2026-09' → 'Sep 2026', matching the rest of the site. */
const month = (ym: string) => monthLabel(`${ym}-01`)
const usdOrNA = (v: number | null) => (v === null ? NOT_AVAILABLE : usd(v))
const exact = (v: number) => new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(v)
const pct = (v: number | null, signed = false) => v === null ? 'Not available' : new Intl.NumberFormat('en-CA', {
  style: 'percent', maximumFractionDigits: 1, signDisplay: signed ? 'exceptZero' : 'auto',
}).format(v)

/** Data & verification page: Washington and Idaho (StateData) or B.C. and Alberta (the PR #6 view below). */
export function ProvincialData() {
  const [params, setParams] = useSearchParams()
  const place = params.get('province') ?? 'WA'
  const view = params.get('view') === 'corridors' ? 'corridors' : params.get('view') === 'counter-tariffs' ? 'counter-tariffs' : 'place'
  const show = (next: typeof view) => setParams(next === 'place' ? {} : { view: next })
  const title = {
    place: 'Washington, Idaho, B.C. & Alberta: data and verification',
    corridors: 'Cross-border corridors: data and verification',
    'counter-tariffs': 'Canada’s counter-tariffs: estimated costs',
  }[view]
  return <div className="app provincial-data">
    <SiteHeader />
    <main className="dash">
      <h1>{title}</h1>
      <div className="segmented data-views" role="group" aria-label="View">
        {([['place', 'By place'], ['corridors', 'Cross-border corridors'], ['counter-tariffs', 'Canada’s counter-tariffs']] as const).map(([k, label]) => (
          <button key={k} type="button" className={view === k ? 'is-active' : ''} aria-pressed={view === k} onClick={() => show(k)}>{label}</button>
        ))}
      </div>
      {view === 'corridors' ? <Corridors /> : view === 'counter-tariffs' ? <CounterTariffData /> : isStatePlace(place) ? <StateData state={place} /> : <ProvinceData />}
    </main>
    <footer className="site-foot"><p>Canadian figures adapted from Statistics Canada; this does not constitute an endorsement by
      Statistics Canada of this product. U.S. figures: Census Bureau, Bureau of Transportation Statistics, EIA, BLS and BEA (public domain). Canada Energy Regulator data:
      Open Government Licence – Canada.</p>
      <p><Link to="/">Return to the PNWER dashboard</Link></p></footer>
  </div>
}

function ProvinceData() {
  const [bundle, setBundle] = useState<ProvincialBundle | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    loadProvincial(controller.signal).then(setBundle).catch((e: Error) => {
      if (!controller.signal.aborted) setError(e.message)
    })
    return () => controller.abort()
  }, [attempt])
  return <>
      <p className="intro">Monthly domestic exports to the U.S. and the world. Explore product groups, inspect the checks,
        and download the records behind each chart. Amounts are in <strong>U.S. dollars (US$)</strong>, converted at the same
        Bank of Canada monthly rates as the dashboard and fact sheets, so the all-goods totals match them. The original
        Canadian-dollar values are in the table and downloads.</p>
      {!bundle && !error && <p role="status">Loading the verified data snapshot…</p>}
      {error && <section className="card" role="alert"><h2>Data could not be loaded</h2><p>{error}</p>
        <button className="btn-primary" onClick={() => { setError(''); setAttempt(attempt + 1) }}>Retry</button>
        <p>No sample figures are substituted.</p></section>}
      {bundle && <Explorer bundle={bundle} />}
  </>
}

function Explorer({ bundle }: { bundle: ProvincialBundle }) {
  const { dataset: data, manifest, base } = bundle
  const [params, setParams] = useSearchParams()
  const province = Object.hasOwn(data.provinces, params.get('province') ?? '') ? params.get('province')! : 'BC'
  const product = Object.hasOwn(data.products, params.get('product') ?? '') ? params.get('product')! : 'all'
  const count = [12, 24, 36].includes(Number(params.get('months'))) ? Number(params.get('months')) : 36
  // Show the same latest month as the dashboard, so both pages describe the same period.
  const through = data.lastMonth < site.meta.dataAsOf ? data.lastMonth : site.meta.dataAsOf
  const rows = monthlySelection(data, province, product, count, through)
  const history = monthlySelection(data, province, product, 36, through)
  const toUsd = (cad: number | null, ym: string) => (cad === null ? null : cadToUsdM(cad, ym, fxMonthly))
  const latest = history.at(-1)
  const prior = latest && history.find((r) => r.month === `${Number(latest.month.slice(0, 4)) - 1}${latest.month.slice(4)}`)
  const last12 = history.slice(-12).map((r) => toUsd(r.valueCad, r.month))
  const latestUsd = latest ? toUsd(latest.valueCad, latest.month) : null
  const priorUsd = prior ? toUsd(prior.valueCad, prior.month) : null
  const summary = latest && {
    month: latest.month,
    us: latestUsd,
    last12: last12.length === 12 && last12.every((v): v is number => v !== null) ? last12.reduce((a, v) => a + v, 0) : null,
    yoy: latestUsd !== null && priorUsd ? latestUsd / priorUsd - 1 : null,
    usShare: latest.worldCad ? latest.valueCad / latest.worldCad : null,
  }
  // Only the all-goods total has an exact dashboard equivalent (same customs records, different product groups).
  const dashboard = product === 'all' && through === site.meta.dataAsOf ? trade(province as JurisdictionId, 'all').last12.exports : null
  const pages = Math.ceil(rows.length / 12)
  const requestedPage = Number(params.get('page') ?? 0)
  const page = Number.isInteger(requestedPage) && requestedPage >= 0 ? Math.min(requestedPage, Math.max(0, pages - 1)) : 0
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    next.delete('page')
    for (const [key, value] of Object.entries(patch)) next.set(key, value)
    setParams(next)
  }
  if (!summary || !rows.length) return <p role="alert">The requested series is unavailable in this snapshot.</p>
  const ranked = Object.keys(data.products).filter((id) => id !== 'all').map((id) => {
    const r = data.rows.find((x) => x.province === province && x.product === id && x.partner === 'us' && x.month === through)
    return { product: id, us: r ? toUsd(r.valueCad, r.month) : null }
  }).sort((a, b) => (b.us ?? 0) - (a.us ?? 0))
  const maximum = Math.max(1e-9, ...ranked.map((s) => s.us ?? 0))
  const stale = Date.now() - new Date(`${through}-01T00:00:00Z`).getTime() > 100 * 86400000
  const download = () => {
    const csv = selectionCsv(data, province, product, count, { fx: fxMonthly, through })
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${province}-${product}-${count}-months.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    <p className="mode-note">Source: <a href={data.source} target="_blank" rel="noreferrer">Statistics Canada table {data.table}</a>
      {' · '}data through {month(through)}{through === site.meta.dataAsOf ? ' (same as the dashboard)' : ''}
      {through < data.lastMonth && ` · Statistics Canada has also published ${month(data.lastMonth)}; it appears here when the dashboard updates`}
      {' · '}snapshot retrieved {manifest.retrievedAt.slice(0, 10)}
      {' · '}<strong>{manifest.quality.checks.length} automated checks passed</strong>; independent-source review is not complete.</p>
    {stale && <p className="scenario-note" role="status">This series is more than 100 days behind today. Check the source release and refresh workflow before citing it as current.</p>}
    <div className="controls">
      <PlaceSelect value={province} onChange={(p) => update({ province: p })} />
      <label className="prov-product"><span>Product group (NAPCS)</span><select value={product} onChange={(e) => update({ product: e.target.value })}>
        {Object.entries(data.products).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label><span>Trend range</span><select value={count} onChange={(e) => update({ months: e.target.value })}>
        {[12, 24, 36].map((n) => <option key={n} value={n}>Last {n} months</option>)}</select></label>
    </div>
    <p className="micro">Product groups are Statistics Canada’s (NAPCS), not the dashboard’s sectors, so only the all-goods total
      has an exact dashboard equivalent.</p>
    <div className="prov-stats" aria-live="polite">
      <div className="stat"><div className="stat-label">Exports to U.S., last 12 months</div><div className="stat-value">{usdOrNA(summary.last12)}</div>
        <div className="stat-note">{dashboard !== null && summary.last12 !== null
          ? <>Dashboard and fact sheet: {usd(dashboard)} ({Math.abs(summary.last12 / dashboard - 1) < 0.001 ? 'under 0.1%' : pct(Math.abs(summary.last12 / dashboard - 1))} apart)</>
          : data.products[product]}</div></div>
      <div className="stat"><div className="stat-label">Exports to U.S. · {month(summary.month)}</div><div className="stat-value">{usdOrNA(summary.us)}</div><div className="stat-note">{data.products[product]}</div></div>
      <div className="stat"><div className="stat-label">Year-over-year change</div><div className="stat-value">{pct(summary.yoy, true)}</div><div className="stat-note">Same month one year earlier, in US$</div></div>
      <div className="stat"><div className="stat-label">U.S. share of world exports</div><div className="stat-value">{pct(summary.usShare)}</div><div className="stat-note">Same province, product group and month</div></div>
    </div>
    <section className="callout prov-insight" aria-live="polite"><h2>What the data show</h2>
      <p>In {month(summary.month)}, {data.provinces[province]} exported {usdOrNA(summary.us)} of {product === 'all' ? 'goods' : data.products[product].toLowerCase()} to the U.S.
        {summary.yoy !== null && <> This was {pct(Math.abs(summary.yoy))} {summary.yoy >= 0 ? 'higher' : 'lower'} than the same month one year earlier.</>}
        {summary.usShare !== null && <> The U.S. accounted for {pct(summary.usShare)} of this group’s exports to all countries.</>}</p>
      <p className="micro">Observed trade changes, not an estimate of tariff-caused losses. Calculated from the records below.</p>
    </section>
    <div className="dash-grid">
      <ChartCard title="Monthly exports to the U.S." subtitle={`${month(rows[0].month)}–${month(rows.at(-1)!.month)} · US$ at monthly Bank of Canada rates; not adjusted for inflation`}
        source={`Statistics Canada ${data.table}`} exportName={`${province}-${product}-monthly`}>
        <div role="img" aria-label={`${data.provinces[province]}, ${data.products[product]}, monthly U.S. export trend; exact values in the table below.`}>
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={rows.map((r) => ({ label: month(r.month), usd: toUsd(r.valueCad, r.month) }))} margin={{ top: 12, right: 16, bottom: 12, left: 12 }}>
              <CartesianGrid stroke={STONE} vertical={false} />
              <XAxis dataKey="label" minTickGap={42} tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis tickFormatter={money} width={76} tick={{ fill: MUTED, fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip formatter={(v) => [usd(Number(v)), 'Exports to U.S.']} />
              <Line dataKey="usd" stroke={BRAND_700} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ChartCard title={`Export composition · ${month(through)}`} subtitle="U.S.-bound exports in US$, ranked by value. Select a group to inspect its trend.">
        <ul className="prov-ranking">{ranked.map((s) => <li key={s.product}><button type="button"
          aria-pressed={product === s.product} onClick={() => update({ product: s.product })}>
          <span>{data.products[s.product]}</span><strong>{usdOrNA(s.us)}</strong>
          <span className="prov-bar"><span style={{ width: `${100 * (s.us ?? 0) / maximum}%` }} /></span>
        </button></li>)}</ul>
      </ChartCard>
    </div>
    <ChartCard title="Records behind the chart" subtitle={`${rows.length} selected months from ${manifest.observationCount.toLocaleString()} observations. Only 12 rows are shown at a time.`}>
      <div className="prov-downloads"><button className="tab" onClick={download}>Download selected CSV</button>
        <a href={`${base}observations.csv`} download>Download all verified observations (original C$)</a></div>
      <div className="prov-table-wrap"><table className="prov-table"><thead><tr><th>Month</th><th>Exports to U.S. (US$)</th><th>Exports to world (US$)</th><th>U.S. share</th><th>C$ per US$</th><th>Exports to U.S., original (C$)</th><th>Official U.S. vector</th></tr></thead>
        <tbody>{[...rows].reverse().slice(page * 12, page * 12 + 12).map((r) => <tr key={r.month}><td>{month(r.month)}</td><td>{usdOrNA(toUsd(r.valueCad, r.month))}</td>
          <td>{usdOrNA(toUsd(r.worldCad, r.month))}</td><td>{pct(r.worldCad !== null && r.worldCad > 0 ? r.valueCad / r.worldCad : null)}</td>
          <td>{fxMonthly[r.month]?.toFixed(4) ?? NOT_AVAILABLE}</td><td>{exact(r.valueCad)}</td><td>v{r.vectorId}</td></tr>)}</tbody></table></div>
      <div className="prov-pagination"><button className="tab" disabled={page === 0} onClick={() => update({ page: String(page - 1) })}>Previous</button>
        <span aria-live="polite">Page {page + 1} of {pages}</span><button className="tab" disabled={page >= pages - 1} onClick={() => update({ page: String(page + 1) })}>Next</button></div>
    </ChartCard>
    <details className="card prov-quality"><summary>Sources, checks and research limitations</summary>
      <p>{manifest.quality.scope}</p>
      <p><strong>Matching the dashboard:</strong> this page shows the dashboard’s latest month and converts with its exchange rates.
        Each time the dashboard data is rebuilt, its B.C. and Alberta totals are compared with this table’s; the build stops
        if they differ by more than 0.5%.</p>
      <ol>{manifest.quality.checks.map((c) => <li key={c.name}><strong>Passed: {c.name}.</strong> {c.detail}</li>)}</ol>
      <h2>Review notes</h2><ul>{data.limitations.map((s) => <li key={s}>{s}</li>)}</ul>
      {manifest.quality.warnings.length > 0 && <><h2>Changes to investigate</h2><ul>{manifest.quality.warnings.map((s) => <li key={s}>{s}</li>)}</ul></>}
      <p>Official table release: {data.sourceReleaseTime}. Version: <code>{manifest.version}</code>. Snapshot published: {manifest.generatedAt}.</p>
      <p>Publication file checksums detect version mismatches; they do not prove that the source statistics are independently correct.</p>
      <ul className="prov-hashes">{manifest.provenance.map((p) => <li key={p.file}><a href={p.url}>{p.file}</a> · SHA-256 <code>{p.sha256}</code></li>)}</ul>
      <a href={`${import.meta.env.BASE_URL}data/provincial/latest.json`} download>Download version and check report</a>
    </details>
  </>
}
