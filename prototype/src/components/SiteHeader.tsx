import { Link } from 'react-router-dom'
import { SITE_TAGLINE, SITE_TITLE } from '../config'
import { data } from '../data'

export function SiteHeader() {
  return (
    <header className="site-head">
      <div className="site-brand">
        <Link to="/" className="site-title">
          {SITE_TITLE}
        </Link>
        <p className="site-tagline">{SITE_TAGLINE}</p>
      </div>
      <div className="site-badges">
        <span className="badge badge-sample">Prototype · Sample data</span>
        <span className="badge">Data as of {data.meta.dataAsOfLabel}</span>
      </div>
    </header>
  )
}
