import { Link, NavLink } from 'react-router-dom'
import { SITE_TAGLINE, SITE_TITLE } from '../config'
import { allReal, realSections, updatedLine } from '../data'

export function SiteHeader({ updatedText }: { updatedText?: string } = {}) {
  return (
    <header className="site-head">
      <div className="site-brand">
        <Link to="/" className="site-title">
          {SITE_TITLE}
        </Link>
        <p className="site-tagline">{SITE_TAGLINE}</p>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/news">Trade & tariff updates</NavLink>
          <NavLink to="/data">Data & verification</NavLink>
          <NavLink to="/glossary">What the terms mean</NavLink>
        </nav>
      </div>
      <div className="site-badges">
        {allReal ? (
          <span className="badge badge-real">Official public data</span>
        ) : (
          realSections.length > 0 && <span className="badge badge-real">Real {realSections.join(' & ')} data</span>
        )}
        {!allReal && (
          <span className="badge badge-sample">{realSections.length ? 'Some sections are samples' : 'Prototype · Sample data'}</span>
        )}
        <span className="badge badge-updated">{updatedText ?? updatedLine()}</span>
      </div>
    </header>
  )
}
