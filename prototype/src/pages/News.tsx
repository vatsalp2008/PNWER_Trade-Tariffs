import { useMemo, useState } from 'react'
import { NewsList } from '../components/NewsList'
import { SiteHeader } from '../components/SiteHeader'
import { news, newsUpdated } from '../data'
import { JURISDICTIONS, SECTORS } from '../data/reference'
import type { NewsKind } from '../data/types'
import { dateLabel } from '../lib/format'

/** Full trade & tariff updates feed with simple filters. */
export function News() {
  const [kind, setKind] = useState<NewsKind | 'all'>('all')
  const [jur, setJur] = useState('all')
  const [sector, setSector] = useState('all')
  const [q, setQ] = useState('')

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return news.filter(
      (n) =>
        (kind === 'all' || n.kind === kind) &&
        (jur === 'all' || n.jurisdictions.includes(jur as never)) &&
        (sector === 'all' || n.sectors.includes(sector as never)) &&
        (!needle || n.title.toLowerCase().includes(needle) || n.source.toLowerCase().includes(needle)),
    )
  }, [kind, jur, sector, q])

  return (
    <div className="app">
      <SiteHeader />
      <main className="dash">
        <p className="intro">
          Official announcements and PNWER statements on U.S.–Canada trade and tariffs, plus articles picked by the team. Refreshed
          daily{newsUpdated ? ` · last updated ${dateLabel(newsUpdated)}` : ''}.
        </p>
        <div className="controls">
          <label>
            <span>Source</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as NewsKind | 'all')}>
              <option value="all">All sources</option>
              <option value="official">Official (U.S. & Canada)</option>
              <option value="pnwer">PNWER</option>
              <option value="media">Team picks</option>
            </select>
          </label>
          <label>
            <span>Jurisdiction</span>
            <select value={jur} onChange={(e) => setJur(e.target.value)}>
              <option value="all">All</option>
              {JURISDICTIONS.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sector</span>
            <select value={sector} onChange={(e) => setSector(e.target.value)}>
              <option value="all">All</option>
              {SECTORS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grow">
            <span>Search</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. lumber, dairy, Section 232" />
          </label>
        </div>
        <section className="card">
          <header className="card-head">
            <h3>
              {items.length} update{items.length === 1 ? '' : 's'}
            </h3>
          </header>
          <NewsList items={items} />
          <p className="source">
            Sources: Federal Register; Office of the U.S. Trade Representative; U.S. Customs and Border Protection; Government of
            Canada (Finance, Global Affairs); PNWER. Headlines link to the original publisher.
          </p>
        </section>
      </main>
    </div>
  )
}
