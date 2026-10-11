import { Link, useSearchParams } from 'react-router-dom'
import { BusinessesTable } from '../components/BusinessesTable'
import { ChartCard } from '../components/ChartCard'
import { EraChart } from '../components/EraChart'
import { LensTiles, type Mode } from '../components/LensTiles'
import { NewsList } from '../components/NewsList'
import { PolicyTimeline } from '../components/PolicyTimeline'
import { RegionMap } from '../components/RegionMap'
import { SiteHeader } from '../components/SiteHeader'
import {
  changeSince2024,
  data,
  economy,
  isJurisdictionId,
  isReal,
  newsFor,
  partnerName,
  scenario,
  scopeLabel,
  scopeSector,
  sideTotals,
  sources,
  trade,
  twoWay,
} from '../data'
import { BUSINESS_BY_ID, JURISDICTION_BY_ID, JURISDICTIONS, SECTOR_BY_ID, SECTORS, SOURCES } from '../data/reference'
import type { JurisdictionId, ScopeId, SectorId } from '../data/types'
import { DIV_STOPS, SEQ_STOPS, diverging, gradientCss, sequential } from '../lib/color'
import { compactNum, money, pct, signedPct } from '../lib/format'

type Metric = 'trade' | 'change' | 'dependence' | 'jobs' | 'risk'

const METRICS: Record<Metric, { label: string; legend: string }> = {
  trade: { label: 'Two-way trade (last 12 months)', legend: 'Two-way trade' },
  change: { label: 'Change since 2024 (tariff era)', legend: 'Change since 2024' },
  dependence: { label: 'Share of exports to partner', legend: 'Exports to partner' },
  jobs: { label: 'Jobs in sector', legend: 'Jobs' },
  risk: { label: 'Extra duties if USMCA ends (% of trade)', legend: 'Extra duties' },
}

function metricValue(m: Metric, j: JurisdictionId, scope: ScopeId): number | null {
  switch (m) {
    case 'trade':
      return twoWay(j, scope)
    case 'change':
      return changeSince2024(j, scope)
    case 'dependence':
      return trade(j, scope).exportShareToPartner
    case 'jobs':
      return economy(j, scope).sectorJobs
    case 'risk':
      return scenario(j, scope).extraDutiesShare
  }
}

function metricFormat(m: Metric): (v: number) => string {
  if (m === 'trade') return money
  if (m === 'change') return (v) => signedPct(v)
  if (m === 'jobs') return compactNum
  return (v) => pct(v, m === 'risk' ? 1 : 0)
}

export function Dashboard() {
  const [params, setParams] = useSearchParams()
  const sector = (params.get('s') ?? 'all') as SectorId | 'all'
  const biz = params.get('b') ?? ''
  const jParam = params.get('j') ?? 'ALL'
  const j: JurisdictionId | 'ALL' = isJurisdictionId(jParam) ? jParam : 'ALL'
  const mode: Mode = params.get('mode') === 'noUsmca' ? 'noUsmca' : 'today'
  const metric = (params.get('m') as Metric | null) ?? (mode === 'noUsmca' ? 'risk' : 'trade')
  const scope: ScopeId = biz && BUSINESS_BY_ID[biz] ? biz : sector

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '') p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  // Map colouring
  const values = Object.fromEntries(JURISDICTIONS.map((x) => [x.id, metricValue(metric, x.id, scope)])) as Record<
    JurisdictionId,
    number | null
  >
  const list = Object.values(values).filter((v): v is number => v !== null && Number.isFinite(v))
  const fmt = metricFormat(metric)
  let colorOf: (v: number) => string
  let legend: { low: string; high: string; gradient: string }
  if (metric === 'change') {
    const maxAbs = Math.max(...list.map(Math.abs), 0.01)
    colorOf = (v) => diverging(v / maxAbs)
    legend = { low: signedPct(-maxAbs, 0), high: signedPct(maxAbs, 0), gradient: gradientCss(DIV_STOPS) }
  } else {
    const logScale = metric === 'trade' || metric === 'jobs'
    const tf = (v: number) => (logScale ? Math.log(Math.max(v, 1e-6)) : v)
    const lo = Math.min(...list)
    const hi = Math.max(...list)
    colorOf = (v) => sequential((tf(v) - tf(lo)) / (tf(hi) - tf(lo) || 1))
    legend = { low: fmt(lo), high: fmt(hi), gradient: gradientCss(SEQ_STOPS) }
  }

  const selected = j === 'ALL' ? null : JURISDICTION_BY_ID[j]
  const sectorBusinesses = sector === 'all' ? SECTORS.flatMap((s) => s.businesses) : SECTOR_BY_ID[sector].businesses

  return (
    <div className="app">
      <SiteHeader />

      <main className="dash">
        <p className="intro">
          Pick a sector or business and a jurisdiction to see how cross-border trade, tariffs and USMCA affect it, then
          open a two-page fact sheet.
        </p>

        <nav className="sector-tabs" aria-label="Sector">
          {[{ id: 'all', name: 'All sectors', focus: false }, ...SECTORS].map((s) => (
            <button
              key={s.id}
              type="button"
              className={`tab${sector === s.id ? ' is-active' : ''}`}
              aria-pressed={sector === s.id}
              onClick={() => update({ s: s.id === 'all' ? null : s.id, b: null })}
            >
              {s.name}
              {s.focus && <span className="focus-dot" title="Focus sector in the brief" />}
            </button>
          ))}
        </nav>

        <div className="controls">
          <label>
            <span>Business</span>
            <select
              value={biz}
              onChange={(e) => {
                const id = e.target.value
                update({ b: id || null, s: id ? BUSINESS_BY_ID[id].sector : sector === 'all' ? null : sector })
              }}
            >
              <option value="">All businesses{sector === 'all' ? '' : ` in ${SECTOR_BY_ID[sector].name}`}</option>
              {sectorBusinesses.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Jurisdiction</span>
            <select value={j} onChange={(e) => update({ j: e.target.value === 'ALL' ? null : e.target.value })}>
              <option value="ALL">All PNWER</option>
              {JURISDICTIONS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Colour map by</span>
            <select value={metric} onChange={(e) => update({ m: e.target.value })}>
              {(Object.keys(METRICS) as Metric[]).map((k) => (
                <option key={k} value={k}>
                  {METRICS[k].label}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented" role="group" aria-label="Scenario">
            <button type="button" className={mode === 'today' ? 'is-active' : ''} aria-pressed={mode === 'today'}
              onClick={() => update({ mode: null, m: metric === 'risk' ? null : metric })}>
              Today’s tariffs
            </button>
            <button type="button" className={mode === 'noUsmca' ? 'is-active' : ''} aria-pressed={mode === 'noUsmca'}
              onClick={() => update({ mode: 'noUsmca', m: 'risk' })}>
              If USMCA ends
            </button>
          </div>
        </div>

        <div className="dash-grid">
          <ChartCard
            title={`${scopeLabel(scope)} · ${METRICS[metric].label}`}
            subtitle="U.S. states are measured on trade with Canada; provinces and territories on trade with the U.S."
            source={`${SOURCES.tradeUS}; ${SOURCES.tradeCA}`}
            exportName={`map-${scope}-${metric}`}
            className="map-card"
            sample={metric === 'jobs' ? !isReal('economy') : metric === 'risk' ? !isReal('scenario') : !isReal('trade')}
          >
            <RegionMap
              values={values}
              colorOf={colorOf}
              format={fmt}
              selected={j}
              onSelect={(id) => update({ j: id === j ? null : id })}
              legend={{ ...legend, title: METRICS[metric].legend }}
            />
          </ChartCard>

          <section className="card panel">
            {selected ? (
              <>
                <div className="panel-head">
                  <div>
                    <h2>{selected.name}</h2>
                    <p className="muted">
                      {scopeLabel(scope)} · trade with {partnerName(selected)}
                    </p>
                  </div>
                  {selected.inDepth && <span className="tag">In-depth</span>}
                </div>
                {mode === 'noUsmca' && (
                  <p className="scenario-note">Scenario: USMCA ends and standard tariffs apply to trade that is duty-free today.</p>
                )}
                <LensTiles j={selected} scope={scope} mode={mode} />
                <div className="panel-chart">
                  <EraChart rolling={trade(selected.id, scope).rolling} partner={partnerName(selected)} height={84} compact />
                  <p className="micro">
                    <span className="key key-exp" /> Exports <span className="key key-imp" /> Imports · 12-month totals,
                    2018–2026 · shaded: tariff era
                  </p>
                </div>
                <Link className="btn-primary" to={`/factsheet/${selected.id}/${scope}`}>
                  Open 2-page fact sheet
                </Link>
                <button type="button" className="btn-quiet" onClick={() => update({ j: null })}>
                  Back to all PNWER
                </button>
              </>
            ) : (
              <RegionPanel scope={scope} onPick={(id) => update({ j: id })} />
            )}
          </section>
        </div>

        <ChartCard
          title={`Businesses${sector === 'all' ? '' : ` in ${SECTOR_BY_ID[sector].name}`}`}
          subtitle={
            j === 'ALL'
              ? 'Two-way trade over the latest 12 months and change since 2024, shown separately for each side of the border.'
              : `Two-way trade between ${JURISDICTION_BY_ID[j].name} and ${partnerName(JURISDICTION_BY_ID[j])} over the latest 12 months.`
          }
          source={`${SOURCES.tradeUS}; ${SOURCES.tradeCA}; ${SOURCES.tariffs}`}
          sample={!isReal('trade')}
        >
          <BusinessesTable sector={sector} jurisdiction={j} highlight={biz} />
        </ChartCard>

        <ChartCard
          title={`Tariff and policy timeline · ${scopeLabel(scope)}`}
          subtitle="Every change is a new cost or a new uncertainty for businesses on both sides of the border."
          source={SOURCES.tariffs}
        >
          <PolicyTimeline scope={scope} />
        </ChartCard>

        <ChartCard
          title="Latest trade & tariff updates"
          subtitle={`Official announcements, PNWER statements and team picks${scope !== 'all' || j !== 'ALL' ? ', most relevant to your selection first' : ''}. Not verified by the team; the tariff timeline above is.`}
          source="Federal Register; USTR; U.S. Customs and Border Protection; Government of Canada; PNWER"
        >
          <NewsList items={newsFor(scopeSector(scope), j === 'ALL' ? null : j, 6)} />
          <Link className="text-link" to="/news">
            See all updates →
          </Link>
        </ChartCard>
      </main>

      <footer className="site-foot">
        <p>{data.meta.note}</p>
        {sources.length > 0 && (
          <ul className="source-list">
            {sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
        <p>Policy events are compiled from public reporting and still need to be checked against official sources.</p>
      </footer>
    </div>
  )
}

function RegionPanel({ scope, onPick }: { scope: ScopeId; onPick: (id: JurisdictionId) => void }) {
  const us = sideTotals('US', scope)
  const ca = sideTotals('CA', scope)
  const ranked = JURISDICTIONS.map((x) => ({ x, c: changeSince2024(x.id, scope) }))
    .filter((r): r is { x: (typeof JURISDICTIONS)[number]; c: number } => r.c !== null)
    .sort((a, b) => a.c - b.c)
    .slice(0, 4)
  return (
    <>
      <div className="panel-head">
        <div>
          <h2>All PNWER</h2>
          <p className="muted">{scopeLabel(scope)} · latest 12 months</p>
        </div>
      </div>
      <div className="side-pair">
        {[
          { title: 'U.S. states ↔ Canada', t: us, exp: 'Exports to Canada', imp: 'Imports from Canada' },
          { title: 'Provinces & territories ↔ U.S.', t: ca, exp: 'Exports to the U.S.', imp: 'Imports from the U.S.' },
        ].map((x) => (
          <div className="side-card" key={x.title}>
            <h4>{x.title}</h4>
            <dl>
              <dt>{x.exp}</dt>
              <dd>{money(x.t.last12.exports)}</dd>
              <dt>{x.imp}</dt>
              <dd>{money(x.t.last12.imports)}</dd>
              <dt>Change since 2024</dt>
              <dd className={x.t.changeSince2024 < 0 ? 'down' : 'up'}>{signedPct(x.t.changeSince2024)}</dd>
            </dl>
          </div>
        ))}
      </div>
      <p className="micro">The two sides are shown separately: adding them would count the same shipments twice.</p>
      <h4 className="list-title">Biggest declines since 2024</h4>
      <ul className="rank-list">
        {ranked.map(({ x, c }) => (
          <li key={x.id}>
            <button type="button" onClick={() => onPick(x.id)}>
              <span>{x.name}</span>
              <span className={c < 0 ? 'down' : 'up'}>{signedPct(c)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">Select a jurisdiction on the map to see its four-lens snapshot and open its fact sheet.</p>
    </>
  )
}
