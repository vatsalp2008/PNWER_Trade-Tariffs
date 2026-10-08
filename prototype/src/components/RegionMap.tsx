import { geoConicConformal, geoPath } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { useState } from 'react'
import geoRaw from '../data/pnwer-region.geo.json?raw'
import { JURISDICTION_BY_ID } from '../data/reference'
import type { JurisdictionId } from '../data/types'

type Props = { id: JurisdictionId; name: string }
const shapes = JSON.parse(geoRaw) as FeatureCollection<Geometry, Props>

const W = 600
const H = 470
// One conic projection centred on the region keeps Alaska and the territories
// attached instead of in inset boxes.
const projection = geoConicConformal().parallels([49, 64]).rotate([125, 0]).fitExtent(
  [
    [8, 8],
    [W - 8, H - 8],
  ],
  shapes,
)
const path = geoPath(projection)

// Nudges for labels whose geometric centre sits awkwardly.
const LABEL_NUDGE: Partial<Record<JurisdictionId, [number, number]>> = {
  AK: [18, 14],
  NT: [10, 30],
  ID: [0, 12],
  WA: [2, 0],
}

const FEATURES = shapes.features.map((f: Feature<Geometry, Props>) => {
  const [cx, cy] = path.centroid(f)
  const [dx, dy] = LABEL_NUDGE[f.properties.id] ?? [0, 0]
  return { id: f.properties.id, name: f.properties.name, d: path(f) ?? '', label: [cx + dx, cy + dy] as const }
})

/** Relative luminance check so labels stay readable on dark fills. */
function isDark(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45
}

interface MapProps {
  values: Record<JurisdictionId, number>
  colorOf: (v: number) => string
  format: (v: number) => string
  selected: JurisdictionId | 'ALL'
  onSelect: (id: JurisdictionId) => void
  legend: { gradient: string; low: string; high: string; title: string }
}

export function RegionMap({ values, colorOf, format, selected, onSelect, legend }: MapProps) {
  const [hover, setHover] = useState<JurisdictionId | null>(null)
  const focus = hover ?? (selected === 'ALL' ? null : selected)
  return (
    <div className="region-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Map of the 10 PNWER jurisdictions">
        {FEATURES.map((f) => (
          <path
            key={f.id}
            d={f.d}
            className="jur-shape"
            fill={colorOf(values[f.id])}
            tabIndex={0}
            role="button"
            aria-label={`${f.name}: ${format(values[f.id])}`}
            onClick={() => onSelect(f.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(f.id)}
            onMouseEnter={() => setHover(f.id)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        {selected !== 'ALL' && <path d={FEATURES.find((f) => f.id === selected)?.d} className="jur-outline" />}
        {FEATURES.map((f) => (
          <text
            key={f.id}
            x={f.label[0]}
            y={f.label[1]}
            className={`jur-label${isDark(colorOf(values[f.id])) ? ' on-dark' : ''}`}
            textAnchor="middle"
          >
            {f.id}
            {JURISDICTION_BY_ID[f.id].inDepth ? ' ★' : ''}
          </text>
        ))}
      </svg>
      <div className="map-foot">
        <div className="map-readout" aria-live="polite">
          {focus ? (
            <>
              <strong>{JURISDICTION_BY_ID[focus].name}</strong> {format(values[focus])}
            </>
          ) : (
            'Hover or click a jurisdiction'
          )}
        </div>
        <div className="legend">
          <span className="legend-title">{legend.title}</span>
          <span className="legend-scale">
            <span>{legend.low}</span>
            <span className="legend-bar" style={{ background: legend.gradient }} />
            <span>{legend.high}</span>
          </span>
          <span className="legend-note">★ in-depth jurisdiction</span>
        </div>
      </div>
    </div>
  )
}
