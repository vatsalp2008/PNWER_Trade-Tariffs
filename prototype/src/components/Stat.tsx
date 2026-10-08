import type { ReactNode } from 'react'

interface Props {
  label: ReactNode
  value: ReactNode
  note?: ReactNode
  tone?: 'neutral' | 'down' | 'up'
}

export function Stat({ label, value, note, tone = 'neutral' }: Props) {
  return (
    <div className={`stat tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
  )
}
