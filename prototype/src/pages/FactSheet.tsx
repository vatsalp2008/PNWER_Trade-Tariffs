import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChartCard } from '../components/ChartCard'
import { EraChart, type Marker } from '../components/EraChart'
import { MiniLine } from '../components/MiniLine'
import { PartnerBars } from '../components/PartnerBars'
import { PageWatermark } from '../components/SampleWatermark'
import { Stat } from '../components/Stat'
import { TariffTable } from '../components/TariffTable'
import { TopProductsTable } from '../components/TopProductsTable'
import { SITE_TITLE } from '../config'
import {
  affordability,
  data,
  economy,
  factSheetEvents,
  goodsNoun,
  industryNoun,
  isInEffect,
  isJurisdictionId,
  isReal,
  isScope,
  jurisdictionEconomy,
  keyEvents,
  partnerName,
  partnerShort,
  scenario,
  scopeLabel,
  scopeSector,
  trade,
} from '../data'
import { COUNTRY_ADJ, JURISDICTION_BY_ID, JURISDICTIONS, SECTOR_BY_ID, SECTORS, SOURCES } from '../data/reference'
import type { Jurisdiction, ScopeId } from '../data/types'
import { compactNum, decimalYear, dollars, money, num, pct, signedPct } from '../lib/format'

const PAGE_W = 816 // 8.5in at 96 dpi
const CHART_W = 720

export function FactSheet() {
  const { jur, scope } = useParams()
  if (!isJurisdictionId(jur) || !isScope(scope)) {
    return (
      <div className="not-found">
        <p>That fact sheet doesn’t exist.</p>
        <Link to="/">Back to the dashboard</Link>
      </div>
    )
  }
  return <Sheet j={JURISDICTION_BY_ID[jur]} scope={scope} />
}

function Sheet({ j, scope }: { j: Jurisdiction; scope: ScopeId }) {
  const navigate = useNavigate()
  const stackRef = useRef<HTMLDivElement>(null)
  const zoom = useFitWidth(stackRef)
  useOverflowCheck(stackRef, `${j.id}/${scope}`)

  const label = scopeLabel(scope)
  useEffect(() => {
    const prev = document.title
    document.title = `${j.id} ${label} fact sheet (sample)`
    return () => {
      document.title = prev
    }
  }, [j.id, label])

  return (
    <div className="sheet-screen">
      <div className="sheet-toolbar no-print">
        <Link to={`/?j=${j.id}${scope !== 'all' ? (scope in SECTOR_BY_ID ? `&s=${scope}` : `&s=${scopeSector(scope)}&b=${scope}`) : ''}`} className="text-link">
          ← Dashboard
        </Link>
        <select value={j.id} onChange={(e) => navigate(`/factsheet/${e.target.value}/${scope}`)} aria-label="Jurisdiction">
          {JURISDICTIONS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select value={scope} onChange={(e) => navigate(`/factsheet/${j.id}/${e.target.value}`)} aria-label="Sector or business">
          <option value="all">All traded goods</option>
          {SECTORS.map((s) => (
            <optgroup key={s.id} label={s.name}>
              <option value={s.id}>{s.name} (whole sector)</option>
              {s.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          Download PDF
        </button>
        <span className="micro">Opens the print dialog. Choose “Save as PDF”.</span>
      </div>

      <div className="sheet-stack" ref={stackRef} style={{ ['--sheet-zoom' as string]: zoom }}>
        <PageOne j={j} scope={scope} />
        <PageTwo j={j} scope={scope} />
      </div>
    </div>
  )
}

function SheetHeader({ j, scope, title, sub, tags = true, sample }: { j: Jurisdiction; scope: ScopeId; title: string; sub: string; tags?: boolean; sample: boolean }) {
  const sector = scopeSector(scope)
  return (
    <header className="sheet-head">
      <div className="sheet-kicker">
        <span>{SITE_TITLE}</span>
        {sample ? (
          <span className="badge badge-sample">Sample data · not for citation</span>
        ) : (
          <span className="badge badge-real">Official data · sources below</span>
        )}
      </div>
      <h1>{title}</h1>
      <p className="sheet-sub">{sub}</p>
      {tags && (
        <div className="sheet-tags">
          {sector && SECTOR_BY_ID[sector].focus && <span className="tag">Focus sector</span>}
          {j.inDepth && <span className="tag">In-depth jurisdiction</span>}
          <span className="tag tag-quiet">Data as of {data.meta.dataAsOfLabel}</span>
        </div>
      )}
    </header>
  )
}

function eventNumbers(scope: ScopeId) {
  const { shown, total } = factSheetEvents(scope)
  const markers: Marker[] = keyEvents(scope)
    .filter((e) => shown.includes(e))
    .map((e) => ({ x: decimalYear(e.date), n: shown.indexOf(e) + 1 }))
  return { shown, total, markers }
}

function PageOne({ j, scope }: { j: Jurisdiction; scope: ScopeId }) {
  const t = trade(j.id, scope)
  const partner = partnerName(j)
  const label = scopeLabel(scope)
  const lower = goodsNoun(scope)
  const prevTotal = t.prev12.exports + t.prev12.imports
  const change = prevTotal > 0 ? (t.last12.exports + t.last12.imports) / prevTotal - 1 : null
  const { markers } = eventNumbers(scope)
  const tradeSource = j.country === 'US' ? SOURCES.tradeUS : SOURCES.tradeCA
  const growthMax = Math.max(Math.abs(t.growthUsmcaToPartner), Math.abs(t.growthUsmcaToWorld), 0.05)
  const sample = !isReal('trade')

  return (
    <article className="sheet-page">
      {sample && <PageWatermark />}
      <SheetHeader
        j={j}
        scope={scope}
        sample={sample}
        title={`${label} in ${j.name}`}
        sub={`How closely is it tied to ${partner}? Latest 12 months of trade, in U.S. dollars.`}
      />

      <div className="stat-row">
        <Stat label={`Exports to ${partner}`} value={money(t.last12.exports)} note="last 12 months" />
        <Stat label={`Imports from ${partner}`} value={money(t.last12.imports)} note="last 12 months" />
        <Stat
          label="Change in two-way trade"
          value={change === null ? '—' : signedPct(change)}
          note="vs. previous 12 months"
          tone={change === null ? 'neutral' : change < 0 ? 'down' : 'up'}
        />
        <Stat label={`${partnerShort(j)} as an export market`} value={t.partnerRank ? `#${t.partnerRank}` : '—'} note={`for ${j.name}’s ${lower}`} />
      </div>

      <ChartCard
        title={`Trade with ${partner} across three eras`}
        subtitle="Total over the previous 12 months. Numbered lines mark tariff actions listed on page 2; the dashed line is the latest month of data."
        source={tradeSource}
        exportName={`${j.id}-${scope}-three-eras`}
        sample={sample}
      >
        <EraChart rolling={t.rolling} partner={partner} markers={markers} width={CHART_W} height={205} />
      </ChartCard>

      <div className="two-col">
        <ChartCard title="Economic integration" source={`${tradeSource}; ${SOURCES.partnerJur}`} exportName={`${j.id}-${scope}-integration`} sample={sample}>
          <div className="big-pair">
            <div>
              <div className="big">{pct(t.exportShareToPartner)}</div>
              <div className="big-cap">of {j.name}’s {lower} exports go to {partner}</div>
            </div>
            <div>
              <div className="big">{pct(t.importShareFromPartner)}</div>
              <div className="big-cap">of its {lower} imports come from {partner}</div>
            </div>
          </div>
          <h4 className="mini-title">Main trading partners in {partner}</h4>
          <PartnerBars rows={t.partnerJurisdictions} />
        </ChartCard>

        <ChartCard title="Competitiveness" source={tradeSource} exportName={`${j.id}-${scope}-competitiveness`} sample={sample}>
          <h4 className="mini-title">Export growth under USMCA, 2019 → 2024</h4>
          <ul className="bars growth">
            {[
              { name: `To ${partner}`, v: t.growthUsmcaToPartner },
              { name: 'To the rest of the world', v: t.growthUsmcaToWorld },
            ].map((r) => (
              <li key={r.name}>
                <span className="bar-label">{r.name}</span>
                <span className="bar-track">
                  <span className={`bar-fill${r.v < 0 ? ' neg' : ''}`} style={{ width: `${(Math.abs(r.v) / growthMax) * 100}%` }} />
                </span>
                <span className="bar-value">{signedPct(r.v, 0)}</span>
              </li>
            ))}
          </ul>
          <div className="callout">
            <div className="big">
              {t.shareOfPartnerImports < 0.0001 ? '<0.01%' : pct(t.shareOfPartnerImports, t.shareOfPartnerImports < 0.01 ? 2 : 1)}
            </div>
            <div className="big-cap">
              of {partner === 'Canada' ? 'Canada’s' : 'U.S.'} {lower} imports come from {j.name}
            </div>
          </div>
          <p className="micro">
            {t.growthUsmcaToPartner >= t.growthUsmcaToWorld
              ? `Under USMCA, exports to ${partner} grew faster than exports to the rest of the world.`
              : `Under USMCA, exports to ${partner} grew more slowly than exports to the rest of the world.`}
          </p>
        </ChartCard>
      </div>

      <ChartCard title="Top products, last 12 months" source={tradeSource} exportName={`${j.id}-${scope}-top-products`} sample={sample}>
        <TopProductsTable exports={t.topExports} imports={t.topImports} partner={partner} />
      </ChartCard>

      <footer className="sheet-foot">
        <span>Page 1 of 2</span>
        <span>
          {sample
            ? data.meta.note
            : 'Sources: U.S. Census Bureau; adapted from Statistics Canada, CIMT (not an endorsement by Statistics Canada); Bank of Canada exchange rates.'}
        </span>
      </footer>
    </article>
  )
}

function PageTwo({ j, scope }: { j: Jurisdiction; scope: ScopeId }) {
  const e = economy(j.id, scope)
  const je = jurisdictionEconomy(j.id)
  const a = affordability(j.id, scope)
  const s = scenario(j.id, scope)
  const t = trade(j.id, scope)
  const partner = partnerName(j)
  const owner = COUNTRY_ADJ[j.partner]
  const label = scopeLabel(scope)
  const lower = goodsNoun(scope)
  const industry = industryNoun(scope)
  const { shown, total } = eventNumbers(scope)
  const active = shown.filter((x) => (x.kind === 'tariff' || x.kind === 'counter-tariff') && isInEffect(x)).length
  const sector = scopeSector(scope)
  const quote = data.quotes.find((q) => q.sector === (sector ?? 'mfg'))!
  const empRate = je.employmentRate
  const gdpPc = je.gdpPerCapita
  const us = j.country === 'US'

  return (
    <article className="sheet-page">
      <SheetHeader j={j} scope={scope} title="Why it matters and what’s at risk" sub={`${label} in ${j.name} · data as of ${data.meta.dataAsOfLabel}`} tags={false} sample={!isReal('economy') || !isReal('affordability') || !isReal('scenario')} />

      <div className="three-col">
        <ChartCard title="Employment" source={`${us ? SOURCES.jobsUS : SOURCES.jobsCA}; ${us ? SOURCES.ownedUS : SOURCES.ownedCA}`} sample={!isReal('economy')}>
          <dl className="facts">
            <dt>Jobs in {industry}</dt>
            <dd>{num(e.sectorJobs)}</dd>
            <dt>Jobs supported by exports to {partner} (estimate)</dt>
            <dd>{num(e.jobsSupportedByExports)}</dd>
            <dt>{owner}-owned companies in {j.name}</dt>
            <dd>
              {num(je.partnerOwnedFirms)} <span className="dd-note">employing {num(je.partnerOwnedJobs)}</span>
            </dd>
            <dt>Employment rate, {empRate[empRate.length - 1].year}</dt>
            <dd className="with-line">
              {empRate[empRate.length - 1].value}% <MiniLine values={empRate.map((x) => x.value)} width={70} height={20} />
            </dd>
          </dl>
        </ChartCard>

        <ChartCard title="Economic output" source={us ? SOURCES.gdpUS : SOURCES.gdpCA} sample={!isReal('economy')}>
          <dl className="facts">
            <dt>Output of {industry}</dt>
            <dd>{money(e.sectorGdp)}</dd>
            <dt>Share of {j.name}’s economy</dt>
            <dd>{pct(e.sectorGdpShare, 1)}</dd>
            <dt>GDP per person, {gdpPc[gdpPc.length - 1].year}</dt>
            <dd className="with-line">
              {dollars(gdpPc[gdpPc.length - 1].value)} <MiniLine values={gdpPc.map((x) => x.value)} width={70} height={20} />
            </dd>
            <dt>Total economy</dt>
            <dd>{money(je.totalGdp)}</dd>
          </dl>
        </ChartCard>

        <ChartCard title="Affordability" source={`${SOURCES.tariffs}; ${SOURCES.prices}`} sample={!isReal('affordability')}>
          <dl className="facts">
            <dt>Everyday goods & inputs imported from {partner}</dt>
            <dd>{money(a.everydayAndInputImports)}</dd>
            <dt>Estimated duties at today’s tariffs (per year)</dt>
            <dd>{money(a.estDutiesToday)}</dd>
            <dt>Per household</dt>
            <dd>{dollars(a.dutiesPerHousehold)}</dd>
            <dt>Import prices from {partner}, last 12 months</dt>
            <dd className="down">{signedPct(a.importPriceChange)}</dd>
          </dl>
        </ChartCard>
      </div>

      <ChartCard
        title="Tariff actions since January 2025"
        subtitle={`${total} actions have touched ${lower}${total > shown.length ? ` (${shown.length} most relevant shown)` : ''}; ${active} still in effect. Each change is a new cost or a new uncertainty for businesses.`}
        source={SOURCES.tariffs}
      >
        <TariffTable events={shown} />
      </ChartCard>

      <ChartCard title="If USMCA isn’t renewed" source={`${SOURCES.usmcaUse}; ${SOURCES.mfn}`} exportName={`${j.id}-${scope}-no-usmca`} sample={!isReal('scenario')}>
        <div className="scenario-grid">
          <Stat label="Trade now duty-free under USMCA" value={pct(s.usmcaDutyFreeShare)} />
          <Stat label={`Tariff on exports to ${partner} without USMCA`} value={pct(s.mfnOnExports, 1)} />
          <Stat label={`Tariff on imports from ${partner} without USMCA`} value={pct(s.mfnOnImports, 1)} />
          <Stat label="Extra duties per year" value={money(s.extraDuties)} note={`${pct(s.extraDutiesShare, 1)} of two-way trade`} tone="down" />
          <div className={`exposure exposure-${s.exposure.toLowerCase()}`}>
            <span>Exposure</span>
            <strong>{s.exposure}</strong>
          </div>
        </div>
        <p className="micro">
          Method: trade that crosses duty-free today would pay standard (most-favoured-nation) tariffs in both directions, and goods
          entering the U.S. would lose their exemption from the 10% Section 301 tariff. Based on the last 12 months of trade ({money(
            t.last12.exports + t.last12.imports,
          )}), before businesses adjust.
        </p>
      </ChartCard>

      <div className="two-col">
        <section className="card quote-card">
          <h3>What businesses are saying</h3>
          <blockquote>“{quote.text}”</blockquote>
          <p className="micro">{quote.attribution}</p>
        </section>
        <section className="card notes-card">
          <h3>About these numbers</h3>
          <ul className="micro">
            <li>{us ? 'Exports are by state of origin of movement; imports by state of destination.' : 'Converted to U.S. dollars at the annual average Bank of Canada rate.'}</li>
            <li>Duty estimates are trade × tariff rate: an upper-bound guide, not a forecast.</li>
            <li>{isReal('trade') ? 'Trade figures are official; sections tagged “Sample” are placeholders.' : 'Every figure on this sheet is sample data for a prototype.'}</li>
          </ul>
        </section>
      </div>

      <footer className="sheet-foot">
        <span>Page 2 of 2</span>
        <span>{compactNum(e.sectorJobs)} jobs · {money(t.last12.exports + t.last12.imports)} two-way trade · sample data</span>
      </footer>
    </article>
  )
}

/** Shrinks the Letter-size pages to fit narrow screens (never in print). */
function useFitWidth(ref: RefObject<HTMLDivElement | null>) {
  const [zoom, setZoom] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setZoom(Math.min(1, (el.clientWidth - 8) / PAGE_W))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return zoom
}

/** Flags any page whose content no longer fits on its sheet of paper. */
function useOverflowCheck(ref: RefObject<HTMLDivElement | null>, key: string) {
  useEffect(() => {
    const id = window.setTimeout(() => {
      ref.current?.querySelectorAll<HTMLElement>('.sheet-page').forEach((page, k) => {
        const over = page.scrollHeight > page.clientHeight + 1
        page.dataset.overflow = String(over)
        if (over) console.warn(`Fact sheet ${key}: page ${k + 1} overflows by ${page.scrollHeight - page.clientHeight}px`)
      })
    }, 300)
    return () => window.clearTimeout(id)
  }, [ref, key])
}
