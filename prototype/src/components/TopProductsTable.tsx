import type { ProductValue } from '../data/types'
import { money } from '../lib/format'
import { EXPORT_BAR, IMPORT_BAR } from '../lib/palette'

function List({ title, rows, color }: { title: string; rows: ProductValue[]; color: string }) {
  const max = Math.max(...rows.map((r) => r.value), 0.001)
  return (
    <div className="products">
      <h4>{title}</h4>
      <ol>
        {rows.map((r) => (
          <li key={r.hs + r.name}>
            <span className="prod-bar" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
            <span className="prod-name">
              {r.name} <span className="hs">HS {r.hs}</span>
            </span>
            <span className="prod-value">{money(r.value)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

interface Props {
  exports: ProductValue[]
  imports: ProductValue[]
  partner: string
}

export function TopProductsTable({ exports, imports, partner }: Props) {
  return (
    <div className="products-grid">
      <List title={`Top exports to ${partner}`} rows={exports} color={EXPORT_BAR} />
      <List title={`Top imports from ${partner}`} rows={imports} color={IMPORT_BAR} />
    </div>
  )
}
