import { useRef, type ReactNode } from 'react'
import { ExportPngButton } from './ExportPngButton'
import { CardWatermark } from './SampleWatermark'

interface Props {
  title: string
  subtitle?: ReactNode
  source?: string
  /** Placeholder numbers: shows a "Sample" tag and watermarks the card and its PNG. */
  sample?: boolean
  /** File name for the PNG export; omit to hide the button. */
  exportName?: string
  className?: string
  children: ReactNode
}

export function ChartCard({ title, subtitle, source, sample = false, exportName, className = '', children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <section className={`card ${sample ? 'is-sample ' : ''}${className}`} ref={ref}>
      <header className="card-head">
        <div>
          <h3>
            {title}
            {sample && <span className="sample-tag" title="Placeholder numbers — not real data">Sample</span>}
          </h3>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        {exportName && <ExportPngButton target={ref} fileName={exportName} />}
      </header>
      <div className="card-body">{children}</div>
      {source && (
        <p className="source">
          {sample ? 'Source (planned)' : 'Source'}: {source}
        </p>
      )}
      {sample && <CardWatermark />}
    </section>
  )
}
