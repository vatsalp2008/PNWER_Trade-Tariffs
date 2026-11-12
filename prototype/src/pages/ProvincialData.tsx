import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '../components/ChartCard'
import { SiteHeader } from '../components/SiteHeader'
import { loadProvincial, monthlySelection, selectionCsv, type ProvincialBundle } from '../data/provincial'
import { BRAND_700, MUTED, STONE } from '../lib/palette'

const cad = (v: number) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', notation: 'compact', maximumFractionDigits: 2 }).format(v)
const exact = (v: number) => new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(v)
const pct = (v: number | null, signed = false) => v === null ? 'Not available' : new Intl.NumberFormat('en-CA', {
  style: 'percent', maximumFractionDigits: 1, signDisplay: signed ? 'exceptZero' : 'auto',
}).format(v)

export function ProvincialData() {
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
  return <div className="app provincial-data">
    <SiteHeader updatedText={bundle ? `Provincial exports through ${bundle.dataset.lastMonth} · CAD` : 'Provincial exports · CAD'} />
    <main className="dash">
      <h1>BC & Alberta: data and verification</h1>
      <p className="intro">Monthly domestic exports to the U.S. and the world. Explore product groups, inspect the checks,
        and download the records behind each chart. Amounts on this page are <strong>Canadian dollars (CAD)</strong>.</p>
      {!bundle && !error && <p role="status">Loading the verified data snapshot…</p>}
      {error && <section className="card" role="alert"><h2>Data could not be loaded</h2><p>{error}</p>
        <button className="btn-primary" onClick={() => { setError(''); setAttempt(attempt + 1) }}>Retry</button>
        <p>No sample figures are substituted.</p></section>}
      {bundle && <Explorer bundle={bundle} />}
    </main>
    <footer className="site-foot"><p>Adapted from Statistics Canada. This does not constitute an endorsement by Statistics Canada of this product.</p>
      <p><Link to="/">Return to the PNWER dashboard</Link></p></footer>
  </div>
}

function Explorer({ bundle }: { bundle: ProvincialBundle }) {
  const { dataset: data, manifest, base } = bundle
  const [params, setParams] = useSearchParams()
  const province = Object.hasOwn(data.provinces, params.get('province') ?? '') ? params.get('province')! : 'BC'
  const product = Object.hasOwn(data.products, params.get('product') ?? '') ? params.get('product')! : 'all'
  const count = [12, 24, 36].includes(Number(params.get('months'))) ? Number(params.get('months')) : 36
  const rows = monthlySelection(data, province, product, count)
  const summary = data.summaries.find((s) => s.province === province && s.product === product)
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
  const ranked = data.summaries.filter((s) => s.province === province && s.product !== 'all').sort((a, b) => b.usCad - a.usCad)
  const maximum = Math.max(1, ...ranked.map((s) => s.usCad))
  const stale = Date.now() - new Date(`${data.lastMonth}-01T00:00:00Z`).getTime() > 100 * 86400000
  const download = () => {
    const url = URL.createObjectURL(new Blob([selectionCsv(data, province, product, count)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${province}-${product}-${count}-months.csv`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <>
    <p className="mode-note">Source: <a href={data.source} target="_blank" rel="noreferrer">Statistics Canada table {data.table}</a>
      {' · '}data through {data.lastMonth}{' · '}snapshot retrieved {manifest.retrievedAt.slice(0, 10)}
      {' · '}<strong>{manifest.quality.checks.length} automated checks passed</strong>; independent-source review is not complete.</p>
    {stale && <p className="scenario-note" role="status">This series is more than 100 days behind today. Check the source release and refresh workflow before citing it as current.</p>}
    <div className="controls">
      <label><span>Province</span><select value={province} onChange={(e) => update({ province: e.target.value })}>
        {Object.entries(data.provinces).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="prov-product"><span>Product group (NAPCS)</span><select value={product} onChange={(e) => update({ product: e.target.value })}>
        {Object.entries(data.products).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label><span>Trend range</span><select value={count} onChange={(e) => update({ months: e.target.value })}>
        {[12, 24, 36].map((n) => <option key={n} value={n}>Last {n} months</option>)}</select></label>
    </div>
    <div className="prov-stats" aria-live="polite">
      <div className="stat"><div className="stat-label">Exports to U.S. · {summary.month}</div><div className="stat-value">{cad(summary.usCad)}</div><div className="stat-note">CAD · {data.products[product]}</div></div>
      <div className="stat"><div className="stat-label">Year-over-year change</div><div className="stat-value">{pct(summary.yoy, true)}</div><div className="stat-note">Compared with the same month one year earlier</div></div>
      <div className="stat"><div className="stat-label">U.S. share of world exports</div><div className="stat-value">{pct(summary.usShare)}</div><div className="stat-note">Same province, product group and month</div></div>
    </div>
    <section className="callout prov-insight" aria-live="polite"><h2>What the data show</h2>
      <p>In {summary.month}, {data.provinces[province]} exported {cad(summary.usCad)} of {data.products[product].toLowerCase()} to the U.S.
        {summary.yoy !== null && <> This was {pct(Math.abs(summary.yoy))} {summary.yoy >= 0 ? 'higher' : 'lower'} than the same month one year earlier.</>}
        {summary.usShare !== null && <> The U.S. accounted for {pct(summary.usShare)} of this group’s exports to all countries.</>}</p>
      <p className="micro">Observed trade changes, not an estimate of tariff-caused losses. These indicators were calculated by the data pipeline.</p>
    </section>
    <div className="dash-grid">
      <ChartCard title="Monthly exports to the U.S." subtitle={`${rows[0].month}–${rows.at(-1)!.month} · nominal CAD; not adjusted by this pipeline`}
        source={`Statistics Canada ${data.table}`} exportName={`${province}-${product}-monthly`}>
        <div role="img" aria-label={`${data.provinces[province]}, ${data.products[product]}, monthly U.S. export trend; exact values in the table below.`}>
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 12, left: 12 }}>
              <CartesianGrid stroke={STONE} vertical={false} />
              <XAxis dataKey="month" minTickGap={42} tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis tickFormatter={cad} width={76} tick={{ fill: MUTED, fontSize: 11 }} domain={[0, 'auto']} />
              <Tooltip formatter={(v) => [`${exact(Number(v))} CAD`, 'Exports to U.S.']} />
              <Line dataKey="valueCad" stroke={BRAND_700} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ChartCard title={`Export composition · ${data.lastMonth}`} subtitle="U.S.-bound exports, ranked by value. Select a group to inspect its trend.">
        <ul className="prov-ranking">{ranked.map((s) => <li key={s.product}><button type="button"
          aria-pressed={product === s.product} onClick={() => update({ product: s.product })}>
          <span>{data.products[s.product]}</span><strong>{cad(s.usCad)}</strong>
          <span className="prov-bar"><span style={{ width: `${100 * s.usCad / maximum}%` }} /></span>
        </button></li>)}</ul>
      </ChartCard>
    </div>
    <ChartCard title="Records behind the chart" subtitle={`${rows.length} selected months from ${manifest.observationCount.toLocaleString()} observations. Only 12 rows are shown at a time.`}>
      <div className="prov-downloads"><button className="tab" onClick={download}>Download selected CSV</button>
        <a href={`${base}observations.csv`} download>Download all verified observations</a></div>
      <div className="prov-table-wrap"><table className="prov-table"><thead><tr><th>Month</th><th>Exports to U.S. (CAD)</th><th>Exports to world (CAD)</th><th>U.S. share</th><th>Official U.S. vector</th></tr></thead>
        <tbody>{[...rows].reverse().slice(page * 12, page * 12 + 12).map((r) => <tr key={r.month}><td>{r.month}</td><td>{exact(r.valueCad)}</td>
          <td>{r.worldCad === null ? 'Not available' : exact(r.worldCad)}</td><td>{pct(r.worldCad !== null && r.worldCad > 0 ? r.valueCad / r.worldCad : null)}</td><td>v{r.vectorId}</td></tr>)}</tbody></table></div>
      <div className="prov-pagination"><button className="tab" disabled={page === 0} onClick={() => update({ page: String(page - 1) })}>Previous</button>
        <span aria-live="polite">Page {page + 1} of {pages}</span><button className="tab" disabled={page >= pages - 1} onClick={() => update({ page: String(page + 1) })}>Next</button></div>
    </ChartCard>
    <details className="card prov-quality"><summary>Sources, checks and research limitations</summary>
      <p>{manifest.quality.scope}</p>
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
