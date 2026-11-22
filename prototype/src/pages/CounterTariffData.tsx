import { Link, useSearchParams } from 'react-router-dom'
import { ChartCard } from '../components/ChartCard'
import { counterTariffs, type CounterTariffMeasure, type CounterTariffs } from '../data'
import { JURISDICTION_BY_ID } from '../data/reference'
import type { JurisdictionId } from '../data/types'
import { dateLabel, monthLabel, pct, usd } from '../lib/format'

const month = (ym: string) => monthLabel(`${ym}-01`)
const rates = (m: CounterTariffMeasure) => m.rates.map((r) => `${Math.round(r * 100)}%`).join(', ')
const ORDER: JurisdictionId[] = ['WA', 'OR', 'ID', 'MT', 'AK', 'BC', 'AB', 'SK', 'YT', 'NT']

/** The "Canada's counter-tariffs" view of the Data & verification page: what Canada's surtaxes on U.S. goods cost, place by place. */
export function CounterTariffData() {
  const [params, setParams] = useSearchParams()
  const ct = counterTariffs
  if (!ct) return <p className="intro">The counter-tariff estimate hasn’t been built yet (run <code>python pipeline/counter_tariffs.py</code>).</p>
  const pick = params.get('place') ?? 'WA'
  const j = (ORDER.includes(pick as JurisdictionId) ? pick : 'WA') as JurisdictionId
  const choose = (id: string) => setParams({ view: 'counter-tariffs', place: id })
  const range = `${month(ct.window[0])}–${month(ct.window[1])}`
  return (
    <>
      <p className="intro">
        Canada answers U.S. tariffs with its own surtaxes on U.S. goods (counter-tariffs), paid by Canadian importers. This estimates what the
        ones <strong>in force on {dateLabel(ct.asOf)}</strong> would cost over a year, applied to the goods that crossed in {range}, in{' '}
        <strong>U.S. dollars (US$)</strong>. For a state, it’s the surtax on goods coming from that state; for a province, the surtax its
        importers pay on goods from anywhere in the U.S.
      </p>
      <Overview ct={ct} current={j} onPick={choose} />
      <Place ct={ct} j={j} />
      <Measures ct={ct} />
      <details className="card prov-quality">
        <summary>Method, checks and limitations</summary>
        <ol>{ct.checks.map((c) => <li key={c.name}><strong>{c.passed ? 'Passed' : 'Failed'}: {c.name}.</strong> {c.detail}</li>)}</ol>
        <h2>How it’s estimated</h2>
        <ul>
          <li>The lists come from Canada’s surtax orders in the Canada Gazette: each names Canadian tariff items (8-digit product codes) and a surtax rate.</li>
          <li>Trade is Canada’s own import record (Statistics Canada, Canadian International Merchandise Trade), by tariff item, U.S. state of origin and the province where goods clear customs, so each listed item matches exactly.</li>
          <li>Estimate = value of each listed item over the 12 months × its surtax rate today, converted at the dashboard’s monthly Bank of Canada rates.</li>
        </ul>
        <h2>Limitations</h2>
        <ul>
          <li><strong>An upper bound.</strong> It’s before the relief (remission) Canada grants some importers, for example manufacturers and food processors, and it assumes the same goods keep crossing; tariffs usually reduce them.</li>
          <li>Some measures can’t be costed from trade data and are left out (see the list above), for example surtaxes that apply only to goods that don’t qualify under CUSMA, or only to the non-North-American content of vehicles.</li>
          <li>The province is where goods clear customs, which isn’t always where they’re used.</li>
          <li>Measures marked “not yet verified” have not been checked against the official order by the team.</li>
        </ul>
        <p>Sources: Canada Gazette, Part II (surtax orders); Department of Finance Canada; Statistics Canada, Canadian International Merchandise Trade (imports by tariff item). Built {dateLabel(ct.asOf)}.</p>
      </details>
    </>
  )
}

function Overview({ ct, current, onPick }: { ct: CounterTariffs; current: JurisdictionId; onPick: (id: string) => void }) {
  return (
    <ChartCard title="Every PNWER member · a year at today’s rates" subtitle="Estimated Canadian counter-tariffs, the listed goods they apply to, and those goods’ share of the place’s trade. Select one for details.">
      <div className="prov-table-wrap">
        <table className="prov-table corridor-table">
          <thead><tr><th>Place</th><th>Est. counter-tariffs</th><th>Listed goods</th><th>Share of the trade</th></tr></thead>
          <tbody>
            {ORDER.map((id) => {
              const a = ct.jurisdictions[id]?.scopes.all
              if (!a) return null
              const us = JURISDICTION_BY_ID[id].country === 'US'
              return (
                <tr key={id} className={id === current ? 'is-highlight' : ''}>
                  <td><button type="button" className="link-button" onClick={() => onPick(id)}>{ct.jurisdictions[id].name}</button>
                    <span className="muted"> · {us ? 'goods from the state' : 'imports from the U.S.'}</span></td>
                  <td>{usd(a.duties)}</td>
                  <td>{usd(a.covered)}</td>
                  <td>{a.trade ? pct(a.covered / a.trade, 1) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </ChartCard>
  )
}

function Place({ ct, j }: { ct: CounterTariffs; j: JurisdictionId }) {
  const place = ct.jurisdictions[j]
  const a = place.scopes.all
  const us = JURISDICTION_BY_ID[j].country === 'US'
  const names: Record<string, string> = Object.fromEntries(ORDER.map((id) => [id, ct.jurisdictions[id]?.name ?? id]))
  const partners = Object.entries(place.byPartner).filter(([, v]) => v >= 0.001).sort((x, y) => (x[0] === 'other' ? 1 : y[0] === 'other' ? -1 : y[1] - x[1]))
  // Short names for the small table: the part before the colon ("September 2026 list").
  const measureName = Object.fromEntries(ct.measures.map((m) => [m.id, m.name.split(':')[0]]))
  return (
    <>
      <h2 className="section-title">{place.name}</h2>
      <div className="prov-stats">
        <div className="stat">
          <div className="stat-label">Est. Canadian counter-tariffs, a year at today’s rates</div>
          <div className="stat-value">{usd(a.duties)}</div>
          <div className="stat-note">{us ? `on goods from ${place.name}` : 'paid on imports from the U.S.'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Goods on Canada’s lists</div>
          <div className="stat-value">{usd(a.covered)}</div>
          <div className="stat-note">{a.trade ? pct(a.covered / a.trade, 1) : '—'} of the {usd(a.trade)} {us ? `Canada imported from ${place.name}` : 'imported from the U.S.'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Average surtax on those goods</div>
          <div className="stat-value">{a.covered ? pct(a.duties / a.covered, 0) : '—'}</div>
          <div className="stat-note"><Link to={`/factsheet/${j}/all`}>Fact sheet for {place.name} →</Link></div>
        </div>
      </div>
      <div className="dash-grid">
        <ChartCard title="Most affected products" subtitle="Estimated surtax a year (US$), by 4-digit HS product.">
          <table className="prov-table counter-place">
            <thead><tr><th>Product</th><th>Listed goods</th><th>Surtax</th><th>Rate</th></tr></thead>
            <tbody>
              {place.top.map((p) => (
                <tr key={p.hs4}><td>{p.name} <span className="muted">HS {p.hs4}</span></td><td>{usd(p.covered)}</td><td>{usd(p.duties)}</td><td>{pct(p.rate, 0)}</td></tr>
              ))}
              {!place.top.length && <tr><td colSpan={4}>No listed goods.</td></tr>}
            </tbody>
          </table>
        </ChartCard>
        <ChartCard title={us ? 'Where it’s paid' : 'Where the goods come from'} subtitle={us ? 'Province where the goods clear Canadian customs.' : 'U.S. state the goods come from.'}>
          <table className="prov-table">
            <thead><tr><th>{us ? 'Province' : 'State'}</th><th>Surtax a year</th></tr></thead>
            <tbody>
              {partners.map(([k, v]) => <tr key={k}><td>{k === 'other' ? (us ? 'Rest of Canada' : 'Other states') : names[k] ?? k}</td><td>{usd(v)}</td></tr>)}
            </tbody>
          </table>
          <h4 className="list-title">By measure</h4>
          <table className="prov-table counter-place">
            <tbody>
              {Object.entries(place.byMeasure).sort((x, y) => y[1] - x[1]).map(([id, v]) => <tr key={id}><td>{measureName[id] ?? id}</td><td>{usd(v)}</td></tr>)}
            </tbody>
          </table>
        </ChartCard>
      </div>
    </>
  )
}

function Measures({ ct }: { ct: CounterTariffs }) {
  return (
    <ChartCard title="Canada’s counter-tariff lists" subtitle="Each surtax order, whether it’s in force today, and whether it’s included in the estimate.">
      <div className="prov-table-wrap">
        <table className="prov-table impact-table measure-table">
          <thead><tr><th>Measure</th><th>In force</th><th>Surtax</th><th>Tariff items</th><th>Canada’s imports, 12 months</th><th>In the estimate</th></tr></thead>
          <tbody>
            {ct.measures.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.sourceUrl ? <a href={m.sourceUrl} target="_blank" rel="noreferrer">{m.name}</a> : m.name}
                  {m.order && <span className="muted"> · {m.order}</span>}
                  {!m.verified && <span className="caution"> · not yet verified by the team</span>}
                  {m.note && <div className="micro">{m.note}</div>}
                </td>
                <td>{m.end ? `${dateLabel(m.start)}–${dateLabel(m.end)}` : `since ${dateLabel(m.start)}`}</td>
                <td>{rates(m)}</td>
                <td>{m.items.toLocaleString()}{m.itemsWithProductRelief > 0 && <div className="micro">{m.itemsWithProductRelief} with relief for some goods</div>}</td>
                <td>{usd(m.canadaImportsUsd)}</td>
                <td>{!m.inForce ? 'No (ended)' : m.costed ? 'Yes' : <>No<div className="micro">{m.notCostedWhy}</div></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="micro">
        Ended: {ct.ended.map((e) => `${e.name} (${e.order}, ${dateLabel(e.start)}–${dateLabel(e.end)})`).join('; ')}.{' '}
        Not included: {ct.notIncluded.join(' ')}
      </p>
    </ChartCard>
  )
}
