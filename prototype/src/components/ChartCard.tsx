import { useRef, type ReactNode } from 'react'
import { ExportPngButton } from './ExportPngButton'
import { CardWatermark } from './SampleWatermark'

interface Props {
  title: string
  subtitle?: ReactNode
  source?: string
  /** File name for the PNG export; omit to hide the button. */
  exportName?: string
  className?: string
  children: ReactNode
}

export function ChartCard({ title, subtitle, source, exportName, className = '', children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <section className={`card ${className}`} ref={ref}>
      <header className="card-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="card-sub">{subtitle}</p>}
        </div>
        {exportName && <ExportPngButton target={ref} fileName={exportName} />}
      </header>
      <div className="card-body">{children}</div>
      {source && <p className="source">Source (planned): {source}</p>}
      <CardWatermark />
    </section>
  )
}
